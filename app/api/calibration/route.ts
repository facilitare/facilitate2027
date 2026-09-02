import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

const PostBody = z.object({
  applicationId: z.string().uuid().optional(),
  applicationIds: z.array(z.string().uuid()).optional(),
  isCalibration: z.boolean().optional(),
}).refine((d) => d.applicationId || d.applicationIds, { message: "applicationId or applicationIds required" });

function getToken(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

async function requireAuth(req: Request) {
  const token = getToken(req);
  if (!token) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) as Response };
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) as Response };
  }
  const sql = getSql();
  const rows = (await sql`select id, name, role, active from evaluators where id = ${session.evaluatorId}`) as any[];
  if (!rows.length) return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) as Response };
  const evaluator = rows[0] as { id: string; name: string; role: string; active: boolean };
  if (!evaluator.active) return { error: Response.json({ error: "Evaluator deactivated", code: "forbidden" }, { status: 403 }) as Response };
  return { evaluator, session, sql };
}

// Helper: compute calibration overview (used by GET and after POST)
async function buildCalibrationOverview(sql: any) {
  // Check column exists (in case migration not yet applied — fallback to false column)
  let hasCalibrationCol = true;
  try {
    await sql`select is_calibration from applications limit 0`;
  } catch {
    hasCalibrationCol = false;
  }

  // Fetch active evaluators (ordered by name for deterministic output)
  const evaluators = (await sql`select id, name, email, role from evaluators where active = true order by name`) as any[];

  // Fetch calibration applications
  let calibrationApps: any[] = [];
  if (hasCalibrationCol) {
    try {
      calibrationApps = (await sql`select id, ref_code, q11_theme, status, is_calibration, wave_id from applications where is_calibration = true order by ref_code`) as any[];
    } catch {
      calibrationApps = [];
    }
  }

  const calibrationIds = calibrationApps.map((a) => a.id);

  // Fetch all applications for picker (lightweight)
  let allApps: any[] = [];
  if (hasCalibrationCol) {
    try {
      allApps = (await sql`select id, ref_code, q11_theme, status, is_calibration, wave_id from applications order by ref_code`) as any[];
    } catch {
      allApps = (await sql`select id, ref_code, q11_theme, status, wave_id from applications order by ref_code`) as any[];
      allApps = allApps.map((r: any) => ({ ...r, is_calibration: false }));
    }
  } else {
    allApps = (await sql`select id, ref_code, q11_theme, status, wave_id from applications order by ref_code`) as any[];
    allApps = allApps.map((r: any) => ({ ...r, is_calibration: false }));
  }

  // If no calibration set, no stats
  if (calibrationIds.length === 0) {
    return {
      hasCalibrationCol,
      evaluators,
      calibrationApps,
      allApps,
      calibrationIds,
      stats: {
        totalApplications: 0,
        totalAssessments: 0,
        submitted: 0,
        outstanding: 0,
        ready: false,
        outstandingList: [] as { evaluatorId: string; evaluatorName: string; outstandingCount: number }[],
      },
      comparison: null as any,
    };
  }

  // Fetch assessments for calibration applications
  // Use IN via ANY(array) for safety
  let assessments: any[] = [];
  try {
    assessments = (await sql`
      select a.id, a.application_id, a.evaluator_id, e.name as evaluator_name, a.state,
        a.focus_score, a.content_score, a.interactivity_score, a.credibility_score
      from assessments a
      join evaluators e on e.id = a.evaluator_id
      where a.application_id = any(${calibrationIds}::uuid[])
      order by e.name, a.application_id
    `) as any[];
  } catch {
    assessments = [];
  }

  // Filter to only active evaluators' assessments for counting
  const activeIds = new Set(evaluators.map((e: any) => e.id));
  const activeAssessments = assessments.filter((a) => activeIds.has(a.evaluator_id));

  // Expected total = calibrationApps * activeEvaluators (if assignment complete)
  // But actual outstanding is based on existing rows that are not submitted
  // For withheld check, we consider: all active evaluators must have submitted for each calibration app
  // So outstanding = assessments where state != 'submitted' (including missing rows)
  // Missing rows = expected - actual
  const expectedTotal = calibrationIds.length * evaluators.length;
  const actualTotal = activeAssessments.length;
  const submitted = activeAssessments.filter((a) => a.state === "submitted").length;
  const missingRows = Math.max(0, expectedTotal - actualTotal);
  const nonSubmittedExisting = activeAssessments.filter((a) => a.state !== "submitted").length;
  const outstanding = missingRows + nonSubmittedExisting;

  // Per-evaluator outstanding breakdown
  const byEvaluator = new Map<string, { name: string; total: number; submitted: number }>();
  for (const ev of evaluators) {
    byEvaluator.set(ev.id, { name: ev.name, total: 0, submitted: 0 });
  }
  for (const a of activeAssessments) {
    const e = byEvaluator.get(a.evaluator_id);
    if (e) {
      e.total++;
      if (a.state === "submitted") e.submitted++;
    }
  }
  // Account for missing rows per evaluator
  for (const ev of evaluators) {
    const rec = byEvaluator.get(ev.id)!;
    const expectedPerEvaluator = calibrationIds.length;
    const missingForEv = Math.max(0, expectedPerEvaluator - rec.total);
    rec.total = expectedPerEvaluator;
    // submitted stays as is; outstanding = total - submitted
  }

  const outstandingList = [...byEvaluator.entries()]
    .filter(([, v]) => v.total - v.submitted > 0)
    .map(([evaluatorId, v]) => ({
      evaluatorId,
      evaluatorName: v.name,
      outstandingCount: v.total - v.submitted,
    }))
    .sort((a, b) => a.evaluatorName.localeCompare(b.evaluatorName));

  const ready = outstanding === 0 && submitted > 0 && submitted === expectedTotal;

  // Comparison (only when ready)
  let comparison: any = null;
  if (ready) {
    const submittedAssessments = activeAssessments.filter((a) => a.state === "submitted");
    // Panel mean per criterion across ALL submitted calibration assessments
    const panelMean = {
      focus: mean(submittedAssessments.map((a) => a.focus_score)),
      content: mean(submittedAssessments.map((a) => a.content_score)),
      interactivity: mean(submittedAssessments.map((a) => a.interactivity_score)),
      credibility: mean(submittedAssessments.map((a) => a.credibility_score)),
    };

    const perAssessor = evaluators.map((ev: any) => {
      const mine = submittedAssessments.filter((a) => a.evaluator_id === ev.id);
      const means = {
        focus: mean(mine.map((a) => a.focus_score)),
        content: mean(mine.map((a) => a.content_score)),
        interactivity: mean(mine.map((a) => a.interactivity_score)),
        credibility: mean(mine.map((a) => a.credibility_score)),
      };
      const deviations = {
        focus: signed1(means.focus! - panelMean.focus!),
        content: signed1(means.content! - panelMean.content!),
        interactivity: signed1(means.interactivity! - panelMean.interactivity!),
        credibility: signed1(means.credibility! - panelMean.credibility!),
      };
      // Also raw numeric deviations for sorting/testing
      const deviationNums = {
        focus: round1(means.focus! - panelMean.focus!),
        content: round1(means.content! - panelMean.content!),
        interactivity: round1(means.interactivity! - panelMean.interactivity!),
        credibility: round1(means.credibility! - panelMean.credibility!),
      };
      return {
        evaluatorId: ev.id,
        evaluatorName: ev.name,
        count: mine.length,
        means: {
          focus: round1(means.focus!),
          content: round1(means.content!),
          interactivity: round1(means.interactivity!),
          credibility: round1(means.credibility!),
        },
        deviations,
        deviationNums,
        // raw means to 1 decimal string as well? keep numbers
      };
    });

    comparison = {
      panelMean: {
        focus: round1(panelMean.focus!),
        content: round1(panelMean.content!),
        interactivity: round1(panelMean.interactivity!),
        credibility: round1(panelMean.credibility!),
      },
      panelMeanRaw: panelMean,
      perAssessor,
      totalSubmitted: submitted,
    };
  }

  return {
    hasCalibrationCol,
    evaluators,
    calibrationApps,
    allApps,
    calibrationIds,
    stats: {
      totalApplications: calibrationIds.length,
      totalAssessments: expectedTotal,
      actualAssessments: actualTotal,
      submitted,
      outstanding,
      ready,
      outstandingList,
    },
    comparison,
  };
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function signed1(n: number): string {
  const r = round1(n);
  // toFixed(1) gives -0.0 for -0, normalize to +0.0 / 0.0
  if (Object.is(r, -0)) return "+0.0";
  const s = r.toFixed(1);
  return r > 0 ? `+${s}` : r < 0 ? s : "+0.0";
}

// ---------------------------------------------------------------------------
// GET — calibration overview (any authenticated user can view, but page guards lead)
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { sql } = auth as any;

  const overview = await buildCalibrationOverview(sql);

  return Response.json({
    evaluators: overview.evaluators,
    calibrationApps: overview.calibrationApps,
    allApps: overview.allApps,
    calibrationIds: overview.calibrationIds,
    stats: overview.stats,
    comparison: overview.comparison,
  });
}

// ---------------------------------------------------------------------------
// POST — mark/unmark calibration set (lead only)
// Body: { applicationId, isCalibration } for single toggle
//       or { applicationIds, isCalibration? } for bulk replace
// If isCalibration omitted in bulk, it means "set calibration set exactly to these ids"
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth as any;
  if (evaluator.role !== "lead") {
    return Response.json({ error: "Only leads can manage calibration", code: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", code: "bad_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { applicationId, applicationIds, isCalibration } = parsed.data;

  // Ensure column exists — try to create if missing (defensive)
  try {
    await sql`select is_calibration from applications limit 0`;
  } catch {
    try {
      await sql`alter table applications add column if not exists is_calibration boolean not null default false`;
    } catch { /* ignore */ }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;

  // Determine operation mode
  let targetIds: string[] = [];
  let mark: boolean = true;

  if (applicationIds) {
    // Bulk: if isCalibration explicitly false, unmark those; if true or omitted, set calibration set to exactly these ids
    if (isCalibration === false) {
      // Unmark specified ids
      targetIds = applicationIds;
      mark = false;
    } else if (isCalibration === true) {
      targetIds = applicationIds;
      mark = true;
    } else {
      // Replace mode: set is_calibration = (id in applicationIds)
      // Validate all ids exist
      if (applicationIds.length > 0) {
        const existing = (await sql`select id from applications where id = any(${applicationIds}::uuid[])`) as any[];
        const found = new Set(existing.map((r: any) => r.id));
        const missing = applicationIds.filter((id) => !found.has(id));
        if (missing.length) {
          return Response.json({ error: `Applications not found: ${missing.join(", ")}`, code: "not_found" }, { status: 404 });
        }
      }
      // Clear previous calibration set
      await sql`update applications set is_calibration = false where is_calibration = true`;
      if (applicationIds.length > 0) {
        await sql`update applications set is_calibration = true where id = any(${applicationIds}::uuid[])`;
        // Update status to scoring for those apps if they were imported
        await sql`update applications set status = 'scoring', updated_at = now() where id = any(${applicationIds}::uuid[]) and status = 'imported'`;
      }
      // Assign each newly marked app to all active evaluators
      if (applicationIds.length > 0) {
        const activeEvs = (await sql`select id from evaluators where active = true`) as any[];
        for (const appId of applicationIds) {
          for (const ev of activeEvs as any[]) {
            await sql`insert into assessments (application_id, evaluator_id, state) values (${appId}, ${ev.id}, 'assigned') on conflict (application_id, evaluator_id) do nothing`;
          }
        }
      }
      await writeAudit({
        actorId: evaluator.id,
        actorName: evaluator.name,
        action: "calibration.set",
        entity: "calibration",
        entityId: null,
        payload: { applicationIds },
        ip,
      });
      const overview = await buildCalibrationOverview(sql);
      return Response.json({
        ok: true,
        mode: "replace",
        calibrationIds: applicationIds,
        stats: overview.stats,
        comparison: overview.comparison,
        evaluators: overview.evaluators,
        calibrationApps: overview.calibrationApps,
        allApps: overview.allApps,
      });
    }
  } else if (applicationId) {
    targetIds = [applicationId];
    mark = isCalibration ?? true;
  }

  if (targetIds.length === 0) {
    return Response.json({ error: "No applications specified", code: "bad_request" }, { status: 400 });
  }

  // Validate ids exist
  const existing = (await sql`select id, ref_code from applications where id = any(${targetIds}::uuid[])`) as any[];
  const foundSet = new Set(existing.map((r: any) => r.id));
  const missing = targetIds.filter((id) => !foundSet.has(id));
  if (missing.length) {
    return Response.json({ error: `Applications not found: ${missing.join(", ")}`, code: "not_found" }, { status: 404 });
  }

  if (mark) {
    await sql`update applications set is_calibration = true, updated_at = now() where id = any(${targetIds}::uuid[])`;
    await sql`update applications set status = 'scoring', updated_at = now() where id = any(${targetIds}::uuid[]) and status = 'imported'`;
    // Assign to ALL active evaluators regardless of assessors_per_application
    const activeEvs = (await sql`select id from evaluators where active = true`) as any[];
    let assigned = 0;
    for (const appId of targetIds) {
      for (const ev of activeEvs as any[]) {
        const res = await sql`insert into assessments (application_id, evaluator_id, state) values (${appId}, ${ev.id}, 'assigned') on conflict (application_id, evaluator_id) do nothing`;
        // neon doesn't return rowCount reliably; count optimistically
        assigned++;
      }
    }
    // De-dupe count: count actual rows for those apps/evaluators
    await writeAudit({
      actorId: evaluator.id,
      actorName: evaluator.name,
      action: "calibration.mark",
      entity: "application",
      entityId: targetIds.join(","),
      payload: { applicationIds: targetIds, assignedToAllActive: true, activeEvaluatorCount: (activeEvs as any[]).length },
      ip,
    });
  } else {
    await sql`update applications set is_calibration = false, updated_at = now() where id = any(${targetIds}::uuid[])`;
    await writeAudit({
      actorId: evaluator.id,
      actorName: evaluator.name,
      action: "calibration.unmark",
      entity: "application",
      entityId: targetIds.join(","),
      payload: { applicationIds: targetIds },
      ip,
    });
  }

  const overview = await buildCalibrationOverview(sql);
  return Response.json({
    ok: true,
    mode: mark ? "mark" : "unmark",
    calibrationIds: overview.calibrationIds,
    stats: overview.stats,
    comparison: overview.comparison,
    evaluators: overview.evaluators,
    calibrationApps: overview.calibrationApps,
    allApps: overview.allApps,
  });
}

// Support PUT as alias for POST (replace)
export async function PUT(req: Request) {
  return POST(req);
}
