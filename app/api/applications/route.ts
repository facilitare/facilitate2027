import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import {
  computeAggregates,
  computeNormalisedTotals,
  rankApplications,
  type ScoringAssessment,
  type RankableApplication,
} from "@/lib/scoring";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

function parseBoolean(v: string | null): boolean | null {
  if (v === null || v === undefined) return null;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

export async function GET(req: Request) {
  const token = getTokenFromRequest(req);
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
  if (!isLead) {
    return Response.json({ error: "Only leads can view the applications ranking", code: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const waveParam = url.searchParams.get("wave");
  const themeParam = url.searchParams.get("theme");
  const statusParam = url.searchParams.get("status");
  // support both camelCase and snake
  const needsCalibrationParam = parseBoolean(
    url.searchParams.get("needsCalibration") ?? url.searchParams.get("needs_calibration") ?? url.searchParams.get("needs-calibration")
  );
  const belowStandardParam = parseBoolean(
    url.searchParams.get("belowStandard") ?? url.searchParams.get("below_standard") ?? url.searchParams.get("below-standard") ?? url.searchParams.get("belowStandard")
  );

  // Fetch settings
  const settingsRows = (await sql`select key, value from settings`) as any[];
  const settingsMap = new Map<string, any>();
  for (const r of settingsRows) {
    try {
      settingsMap.set(r.key, typeof r.value === "string" ? JSON.parse(r.value) : r.value);
    } catch {
      settingsMap.set(r.key, r.value);
    }
  }
  const iafBonusMode = (settingsMap.get("iaf_bonus_mode") ?? "additive") as "additive" | "tiebreak";
  const qualityMinMeanTotal = Number(settingsMap.get("quality_min_mean_total") ?? 5.0);
  const qualityMinMeanCriterion = Number(settingsMap.get("quality_min_mean_criterion") ?? 1.0);
  const normalisationMinSubmissions = Number(settingsMap.get("normalisation_min_submissions") ?? 5);
  // Determine gate criterion — default focus (QUALITY_DEFAULTS)
  // settings don't store gate criterion separately; use default
  const thresholds = {
    minMeanTotal: qualityMinMeanTotal,
    minMeanPerCriterion: qualityMinMeanCriterion,
    gateCriterion: "focus" as const,
    gateMinimum: 1.0,
  };

  // Fetch waves for mapping + wave filter resolution
  const waves = (await sql`select id, name, wave_number, status from waves order by wave_number asc`) as any[];
  let waveIdFilter: string | null = null;
  if (waveParam && waveParam.trim() !== "" && waveParam !== "all") {
    const v = waveParam.trim();
    if (UUID_RE.test(v)) {
      waveIdFilter = v;
    } else if (/^\d+$/.test(v)) {
      const n = parseInt(v, 10);
      const found = waves.find((w: any) => w.wave_number === n);
      if (found) waveIdFilter = found.id;
      else waveIdFilter = v; // will match nothing — return empty
    } else {
      // try name exact or id fallback
      const found = waves.find((w: any) => w.name === v || w.id === v);
      if (found) waveIdFilter = found.id;
      else waveIdFilter = v;
    }
  }

  // Fetch applications — we filter wave/theme/status in JS to avoid dynamic SQL construction
  // but still support server-side query narrowing semantics.
  const appRows = (await sql`
    select
      id, wave_id, ref_code, q11_theme, status, iaf_standing
    from applications
    order by ref_code asc
  `) as any[];

  // Apply wave/theme/status filters (in-memory but semantically server filters)
  let filteredApps = appRows as any[];
  if (waveIdFilter) {
    filteredApps = filteredApps.filter((a: any) => a.wave_id === waveIdFilter);
  }
  if (themeParam && themeParam.trim() !== "" && themeParam !== "all") {
    const want = themeParam.trim().toLowerCase();
    filteredApps = filteredApps.filter((a: any) => (a.q11_theme ?? "").toLowerCase() === want);
  }
  if (statusParam && statusParam.trim() !== "" && statusParam !== "all") {
    const want = statusParam.trim().toLowerCase();
    filteredApps = filteredApps.filter((a: any) => (a.status ?? "").toLowerCase() === want);
  }

  const appIds = filteredApps.map((a: any) => a.id);

  // Fetch assessments for these apps
  // Use separate queries: all assessments for counts, submitted for aggregates
  let allAssessments: any[] = [];
  let submittedAssessments: any[] = [];
  // For global normalised stats we need ALL submitted assessments across wave (not just filtered set)
  // Spec: normalisation is over all submitted totals panel-wide, so compute globally
  const globalSubmittedRows = (await sql`
    select application_id, evaluator_id, state, focus_score, content_score, interactivity_score, credibility_score
    from assessments where state = 'submitted'
  `) as any[];

  if (appIds.length > 0) {
    // Use a single query with IN — neon doesn't support array expansion easily, so fetch all and filter in JS
    // For 200 rows this is fine (max assessments ~ 200*6=1200 rows)
    const rows = (await sql`
      select
        id, application_id, evaluator_id, state,
        focus_score, content_score, interactivity_score, credibility_score
      from assessments
      where state in ('assigned','draft','submitted','recused')
    `) as any[];
    allAssessments = rows.filter((r: any) => appIds.includes(r.application_id));
    submittedAssessments = allAssessments.filter((r: any) => r.state === "submitted");
  }

  // Group assessments per application
  const byApp = new Map<string, ScoringAssessment[]>();
  for (const a of filteredApps) byApp.set(a.id, []);
  for (const r of submittedAssessments) {
    const arr = byApp.get(r.application_id);
    if (arr) {
      arr.push({
        evaluatorId: r.evaluator_id,
        state: r.state,
        focus_score: r.focus_score,
        content_score: r.content_score,
        interactivity_score: r.interactivity_score,
        credibility_score: r.credibility_score,
      });
    }
  }

  // Global scoring inputs for normalisation
  const globalScoringInputs: ScoringAssessment[] = globalSubmittedRows.map((r: any) => ({
    evaluatorId: r.evaluator_id,
    applicationId: r.application_id,
    state: r.state,
    focus_score: r.focus_score,
    content_score: r.content_score,
    interactivity_score: r.interactivity_score,
    credibility_score: r.credibility_score,
  }));

  const normalisedMap = computeNormalisedTotals(byApp, globalScoringInputs, {
    normalisationMinSubmissions: normalisationMinSubmissions,
  });

  // Build rows with aggregates
  type Row = {
    id: string;
    wave_id: string;
    wave_name: string | null;
    ref_code: string;
    theme: string | null;
    status: string;
    iaf_standing: number;
    n: number;
    totalAssessments: number;
    submittedCount: number;
    mean_focus: number | null;
    mean_content: number | null;
    mean_interactivity: number | null;
    mean_credibility: number | null;
    mean_total: number | null;
    display_total: number | null;
    normalised_total: number | null;
    divergence: number | null;
    needsCalibration: boolean;
    qualityStatus: string;
    range_focus: number | null;
    range_content: number | null;
    range_interactivity: number | null;
    range_credibility: number | null;
  };

  const waveNameMap = new Map<string, string>();
  for (const w of waves) waveNameMap.set(w.id, w.name);

  // Count total assessments per app (for "2/3" display)
  const countsByApp = new Map<string, { total: number; submitted: number }>();
  for (const a of filteredApps) countsByApp.set(a.id, { total: 0, submitted: 0 });
  for (const r of allAssessments) {
    const c = countsByApp.get(r.application_id);
    if (!c) continue;
    c.total += 1;
    if (r.state === "submitted") c.submitted += 1;
  }

  const rows: Row[] = [];
  for (const app of filteredApps) {
    const arr = byApp.get(app.id) ?? [];
    const agg = computeAggregates(arr, thresholds as any);
    // display_total per 6.4
    const displayTotal = agg.mean_total !== null ? (iafBonusMode === "additive" ? agg.mean_total + (app.iaf_standing ?? 0) : agg.mean_total) : null;
    const normalised = normalisedMap.get(app.id) ?? null;
    const counts = countsByApp.get(app.id) ?? { total: 0, submitted: 0 };
    rows.push({
      id: app.id,
      wave_id: app.wave_id,
      wave_name: waveNameMap.get(app.wave_id) ?? null,
      ref_code: app.ref_code,
      theme: app.q11_theme ?? null,
      status: app.status,
      iaf_standing: app.iaf_standing ?? 0,
      n: agg.n,
      totalAssessments: counts.total,
      submittedCount: counts.submitted,
      mean_focus: agg.mean_focus,
      mean_content: agg.mean_content,
      mean_interactivity: agg.mean_interactivity,
      mean_credibility: agg.mean_credibility,
      mean_total: agg.mean_total,
      display_total: displayTotal,
      normalised_total: normalised,
      divergence: agg.divergence,
      needsCalibration: agg.needsCalibration,
      qualityStatus: agg.qualityStatus,
      range_focus: agg.range_focus,
      range_content: agg.range_content,
      range_interactivity: agg.range_interactivity,
      range_credibility: agg.range_credibility,
    });
  }

  // Apply needsCalibration / belowStandard filters (post-aggregate)
  let afterFlagFilters = rows;
  if (needsCalibrationParam === true) {
    afterFlagFilters = afterFlagFilters.filter((r) => r.needsCalibration === true);
  } else if (needsCalibrationParam === false) {
    afterFlagFilters = afterFlagFilters.filter((r) => r.needsCalibration === false);
  }
  if (belowStandardParam === true) {
    afterFlagFilters = afterFlagFilters.filter((r) => r.qualityStatus === "below_standard");
  } else if (belowStandardParam === false) {
    afterFlagFilters = afterFlagFilters.filter((r) => r.qualityStatus !== "below_standard");
  }

  // Ranking order per 04-SPEC §6.4 via rankApplications
  const rankable: RankableApplication[] = afterFlagFilters.map((r) => ({
    id: r.id,
    ref_code: r.ref_code,
    iaf_standing: r.iaf_standing,
    aggregates: {
      mean_total: r.mean_total,
      mean_interactivity: r.mean_interactivity,
      mean_content: r.mean_content,
    },
  }));
  const ranked = rankApplications(rankable, { iafBonusMode });
  const rankOrder = new Map<string, number>();
  ranked.forEach((r, idx) => rankOrder.set(r.id, idx));

  afterFlagFilters.sort((a, b) => (rankOrder.get(a.id) ?? 0) - (rankOrder.get(b.id) ?? 0));

  // Attach rank (1-indexed)
  const withRank = afterFlagFilters.map((r, idx) => ({ ...r, rank: idx + 1 }));

  return Response.json(
    {
      applications: withRank,
      total: withRank.length,
      totalUnfiltered: appRows.length,
      iafBonusMode,
      settings: {
        iaf_bonus_mode: iafBonusMode,
        quality_min_mean_total: qualityMinMeanTotal,
        quality_min_mean_criterion: qualityMinMeanCriterion,
        normalisation_min_submissions: normalisationMinSubmissions,
      },
      waves: waves.map((w: any) => ({ id: w.id, name: w.name, wave_number: w.wave_number, status: w.status })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
