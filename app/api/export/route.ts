import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";
import { serializeCsvWithBom } from "@/lib/csv";
import {
  computeAggregates,
  computeNormalisedTotal,
  type ScoringAssessment,
} from "@/lib/scoring";

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

function formatNullableNumber(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  // Keep up to 2 decimals without trailing zeros noise, but deterministic
  // Use fixed 1 decimal for display? Spec says 1 decimal for display, never round before sum.
  // For CSV we export full precision rounded to 2 decimals for readability.
  // Use String(v) if integer, else toFixed(2) trimmed.
  // Simpler: if integer, String(v), else v.toFixed(2) removing trailing zeros? Keep 2dp.
  // We'll use v.toString() truncated to avoid binary float noise, but use toFixed(4) trimmed.
  // For now: if Number.isInteger(v) -> String(v), else v.toFixed(2)
  if (Number.isInteger(v)) return String(v);
  return Number(v.toFixed(2)).toString();
}

function arrayToString(arr: unknown): string {
  if (arr === null || arr === undefined) return "";
  if (Array.isArray(arr)) {
    return (arr as unknown[]).join("; ");
  }
  return String(arr);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "scores";
  const format = url.searchParams.get("format") || "csv";

  // Validate scope
  if (!["scores", "feedback", "full"].includes(scope)) {
    return Response.json(
      { error: `Invalid scope: ${scope}. Use scores|feedback|full`, code: "bad_request" },
      { status: 400 }
    );
  }

  // Validate format — only csv is supported; xlsx is out of scope
  if (format && !["csv", "xlsx"].includes(format)) {
    return Response.json(
      { error: `Invalid format: ${format}. Use csv`, code: "bad_request" },
      { status: 400 }
    );
  }
  if (format === "xlsx") {
    return Response.json(
      { error: "XLSX not supported — use format=csv", code: "bad_request" },
      { status: 400 }
    );
  }

  // Auth
  const token = getSessionFromRequest(req);
  if (!token) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const evalRows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (evalRows.length === 0) {
    return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  }
  const evaluator = evalRows[0] as { id: string; name: string; role: string };
  const isLead = evaluator.role === "lead";

  if (scope === "full" && !isLead) {
    return Response.json({ error: "Only leads can export full scope", code: "forbidden" }, { status: 403 });
  }

  // Fetch evaluators for per-assessor columns (ordered by name for deterministic headers)
  const allEvaluators = (await sql`select id, name from evaluators order by name asc`) as any[];

  // Fetch settings for scoring thresholds and normalisation
  let qualityMinMeanTotal = 5.0;
  let qualityMinMeanCriterion = 1.0;
  let normalisationMinSubmissions = 5;
  try {
    const settingsRows = (await sql`select key, value from settings where key in ('quality_min_mean_total','quality_min_mean_criterion','normalisation_min_submissions')`) as any[];
    for (const r of settingsRows) {
      const raw = r.value;
      const v = typeof raw === "number" ? raw : Number(raw);
      if (isNaN(v)) continue;
      if (r.key === "quality_min_mean_total") qualityMinMeanTotal = v;
      if (r.key === "quality_min_mean_criterion") qualityMinMeanCriterion = v;
      if (r.key === "normalisation_min_submissions") normalisationMinSubmissions = Math.round(v);
    }
  } catch {
    // use defaults
  }

  const thresholds = {
    minMeanTotal: qualityMinMeanTotal,
    minMeanPerCriterion: qualityMinMeanCriterion,
    gateCriterion: "focus" as const,
    gateMinimum: 1.0,
  };

  // Fetch all applications
  let applications: any[] = [];
  try {
    applications = (await sql`
      select
        id, ref_code, wave_id, status,
        q1_email, q2_ticket_status, q3_availability,
        q4_session_provides, q4_session_provides_other,
        q5_audience, q5_audience_other, q6_audience_detail,
        q7_about_session, q7b_benefits, q8_group_setup, q8_group_setup_other,
        q9_room_layout, q9b_furniture, q10_delivery_mode, q11_theme, q12_timekeeping,
        q13_participation_level, q14_methods, q14_methods_other,
        q15_first_ten_minutes, q16_pathway, q17_iaf_member, q18_iaf_qualification,
        q19_large_groups_english,
        q20_full_name, q21_bio, q22_headshot_url, q23_cofacilitators,
        q24_region, q25_ethnicity, q26_career_stage, q27_under_35, q28_gender,
        iaf_standing, submitted_at, imported_at
      from applications
      order by ref_code asc
    `) as any[];
  } catch (e) {
    return Response.json({ error: "Failed to fetch applications", code: "server_error" }, { status: 500 });
  }

  // Fetch all submitted assessments with evaluator info
  const submittedAssessments = (await sql`
    select
      a.id, a.application_id, a.evaluator_id, e.name as evaluator_name,
      a.focus_score, a.content_score, a.interactivity_score, a.credibility_score,
      a.feedback_liked, a.feedback_improve, a.private_note,
      a.state, a.submitted_at
    from assessments a
    join evaluators e on e.id = a.evaluator_id
    where a.state = 'submitted'
    order by e.name asc, a.application_id asc
  `) as any[];

  // Group assessments by application_id
  const byApp = new Map<string, any[]>();
  for (const a of submittedAssessments) {
    const arr = byApp.get(a.application_id) ?? [];
    arr.push(a);
    byApp.set(a.application_id, arr);
  }

  // Also need allAssessments array for normalisation stats (same as submittedAssessments but mapped to ScoringAssessment)
  const allScoring: ScoringAssessment[] = submittedAssessments.map((a: any) => ({
    evaluatorId: a.evaluator_id,
    applicationId: a.application_id,
    state: a.state,
    focus_score: a.focus_score,
    content_score: a.content_score,
    interactivity_score: a.interactivity_score,
    credibility_score: a.credibility_score,
  }));

  // Pre-compute aggregates and normalised per application
  const aggregatesByApp = new Map<string, ReturnType<typeof computeAggregates>>();
  const normalisedByApp = new Map<string, number | null>();

  for (const app of applications) {
    const assessForApp = (byApp.get(app.id) ?? []) as any[];
    const scoringInputs: ScoringAssessment[] = assessForApp.map((a: any) => ({
      evaluatorId: a.evaluator_id,
      state: a.state,
      focus_score: a.focus_score,
      content_score: a.content_score,
      interactivity_score: a.interactivity_score,
      credibility_score: a.credibility_score,
    }));
    const agg = computeAggregates(scoringInputs, thresholds);
    aggregatesByApp.set(app.id, agg);
    const norm = computeNormalisedTotal(scoringInputs, allScoring, {
      normalisationMinSubmissions,
    });
    normalisedByApp.set(app.id, norm);
  }

  // Build per-assessor totals lookup: Map<appId, Map<evaluatorId, total>>
  const perAssessorTotals = new Map<string, Map<string, number>>();
  for (const a of submittedAssessments) {
    const total =
      (a.focus_score ?? 0) +
      (a.content_score ?? 0) +
      (a.interactivity_score ?? 0) +
      (a.credibility_score ?? 0);
    let m = perAssessorTotals.get(a.application_id);
    if (!m) {
      m = new Map<string, number>();
      perAssessorTotals.set(a.application_id, m);
    }
    m.set(a.evaluator_id, total);
  }

  // Per-evaluator header names (sanitised but keep original name quoted)
  const evaluatorHeaders = allEvaluators.map((e: any) => `total_${e.name}`);

  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (scope === "scores") {
    headers = [
      "ref_code",
      "theme",
      "status",
      "n",
      "mean_focus",
      "mean_content",
      "mean_interactivity",
      "mean_credibility",
      "mean_total",
      "normalised_total",
      "divergence",
      "quality_status",
      ...evaluatorHeaders,
    ];

    for (const app of applications) {
      const agg = aggregatesByApp.get(app.id)!;
      const norm = normalisedByApp.get(app.id);
      const totalsMap = perAssessorTotals.get(app.id) ?? new Map();

      const row: unknown[] = [
        app.ref_code,
        app.q11_theme ?? "",
        app.status ?? "",
        String(agg.n),
        agg.mean_focus === null ? "" : formatNullableNumber(agg.mean_focus),
        agg.mean_content === null ? "" : formatNullableNumber(agg.mean_content),
        agg.mean_interactivity === null ? "" : formatNullableNumber(agg.mean_interactivity),
        agg.mean_credibility === null ? "" : formatNullableNumber(agg.mean_credibility),
        agg.mean_total === null ? "" : formatNullableNumber(agg.mean_total),
        norm === null || norm === undefined ? "" : formatNullableNumber(norm),
        agg.divergence === null ? "" : String(agg.divergence),
        agg.qualityStatus ?? "",
      ];
      // per-assessor totals in evaluator order
      for (const ev of allEvaluators) {
        const tot = totalsMap.get(ev.id);
        row.push(tot === undefined ? "" : String(tot));
      }
      rows.push(row);
    }
  } else if (scope === "feedback") {
    headers = ["ref_code", "applicant_name", "applicant_email", "feedback"];

    for (const app of applications) {
      const assessForApp = (byApp.get(app.id) ?? []) as any[];
      // Assemble applicant-facing feedback — never private_note
      let assembled = "";
      if (assessForApp.length > 0) {
        const parts: string[] = [];
        for (const a of assessForApp) {
          const liked = (a.feedback_liked ?? "").trim();
          const improve = (a.feedback_improve ?? "").trim();
          const blockParts: string[] = [];
          blockParts.push(`Assessor: ${a.evaluator_name}`);
          if (liked) blockParts.push(`What we liked:\n${liked}`);
          if (improve) blockParts.push(`What could be improved:\n${improve}`);
          // Note: no private_note here, ever
          parts.push(blockParts.join("\n\n"));
        }
        assembled = parts.join("\n\n---\n\n");
      }

      rows.push([
        app.ref_code,
        app.q20_full_name ?? "",
        app.q1_email ?? "",
        assembled,
      ]);
    }
  } else if (scope === "full") {
    headers = [
      "ref_code",
      "wave_id",
      "status",
      "submitted_at",
      "imported_at",
      "q1_email",
      "q20_full_name",
      "q21_bio",
      "q22_headshot_url",
      "q23_cofacilitators",
      "q24_region",
      "q25_ethnicity",
      "q26_career_stage",
      "q27_under_35",
      "q28_gender",
      "q2_ticket_status",
      "q3_availability",
      "q4_session_provides",
      "q4_session_provides_other",
      "q5_audience",
      "q5_audience_other",
      "q6_audience_detail",
      "q7_about_session",
      "q7b_benefits",
      "q8_group_setup",
      "q8_group_setup_other",
      "q9_room_layout",
      "q9b_furniture",
      "q10_delivery_mode",
      "q11_theme",
      "q12_timekeeping",
      "q13_participation_level",
      "q14_methods",
      "q14_methods_other",
      "q15_first_ten_minutes",
      "q16_pathway",
      "q17_iaf_member",
      "q18_iaf_qualification",
      "q19_large_groups_english",
      "iaf_standing",
      "n",
      "mean_focus",
      "mean_content",
      "mean_interactivity",
      "mean_credibility",
      "mean_total",
      "normalised_total",
      "divergence",
      "quality_status",
      ...evaluatorHeaders,
    ];

    for (const app of applications) {
      const agg = aggregatesByApp.get(app.id)!;
      const norm = normalisedByApp.get(app.id);
      const totalsMap = perAssessorTotals.get(app.id) ?? new Map();

      const row: unknown[] = [
        app.ref_code,
        app.wave_id ?? "",
        app.status ?? "",
        app.submitted_at ? String(app.submitted_at) : "",
        app.imported_at ? String(app.imported_at) : "",
        app.q1_email ?? "",
        app.q20_full_name ?? "",
        app.q21_bio ?? "",
        app.q22_headshot_url ?? "",
        app.q23_cofacilitators ?? "",
        app.q24_region ?? "",
        app.q25_ethnicity ?? "",
        app.q26_career_stage ?? "",
        app.q27_under_35 === null || app.q27_under_35 === undefined
          ? ""
          : String(app.q27_under_35),
        app.q28_gender ?? "",
        arrayToString(app.q2_ticket_status),
        arrayToString(app.q3_availability),
        arrayToString(app.q4_session_provides),
        app.q4_session_provides_other ?? "",
        arrayToString(app.q5_audience),
        app.q5_audience_other ?? "",
        app.q6_audience_detail ?? "",
        app.q7_about_session ?? "",
        app.q7b_benefits ?? "",
        arrayToString(app.q8_group_setup),
        app.q8_group_setup_other ?? "",
        app.q9_room_layout ?? "",
        app.q9b_furniture ?? "",
        app.q10_delivery_mode ?? "",
        app.q11_theme ?? "",
        app.q12_timekeeping ?? "",
        app.q13_participation_level === null || app.q13_participation_level === undefined
          ? ""
          : String(app.q13_participation_level),
        arrayToString(app.q14_methods),
        app.q14_methods_other ?? "",
        app.q15_first_ten_minutes ?? "",
        app.q16_pathway ?? "",
        app.q17_iaf_member ?? "",
        app.q18_iaf_qualification ?? "",
        app.q19_large_groups_english ?? "",
        app.iaf_standing === null || app.iaf_standing === undefined ? "" : String(app.iaf_standing),
        String(agg.n),
        agg.mean_focus === null ? "" : formatNullableNumber(agg.mean_focus),
        agg.mean_content === null ? "" : formatNullableNumber(agg.mean_content),
        agg.mean_interactivity === null ? "" : formatNullableNumber(agg.mean_interactivity),
        agg.mean_credibility === null ? "" : formatNullableNumber(agg.mean_credibility),
        agg.mean_total === null ? "" : formatNullableNumber(agg.mean_total),
        norm === null || norm === undefined ? "" : formatNullableNumber(norm),
        agg.divergence === null ? "" : String(agg.divergence),
        agg.qualityStatus ?? "",
      ];

      for (const ev of allEvaluators) {
        const tot = totalsMap.get(ev.id);
        row.push(tot === undefined ? "" : String(tot));
      }
      rows.push(row);
    }

    // Audit full export (lead only)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      null;
    try {
      await writeAudit({
        actorId: evaluator.id,
        actorName: evaluator.name,
        action: "export.full",
        entity: "export",
        entityId: scope,
        payload: {
          scope,
          applicationCount: applications.length,
          evaluatorCount: allEvaluators.length,
        },
        ip,
      });
    } catch {
      // audit failure should not block export
    }
  }

  const csvBuffer = serializeCsvWithBom(headers, rows);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `export-${scope}-${dateStr}.csv`;

  return new Response(csvBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
      "Content-Length": String(csvBuffer.length),
    },
  });
}
