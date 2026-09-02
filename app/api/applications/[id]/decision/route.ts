import { z } from "zod";
import { verifySession, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit, getClientIpFromRequest } from "@/lib/audit";
import { computeAggregates, type ScoringAssessment } from "@/lib/scoring";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getToken(req: Request): string | null {
  const c = req.headers.get("cookie");
  if (!c) return null;
  const m = c.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

// Map decision -> application.status value
function mapDecisionToStatus(decision: string): string {
  switch (decision) {
    case "accept":
      return "accepted";
    case "decline":
      return "declined";
    case "defer":
      return "deferred";
    case "standby":
      return "standby";
    case "reserve":
      return "standby"; // DB has no 'reserve' status; decision is preserved in panel_decisions.decision, app goes to standby pool (reserve). See 03-DATA-MODEL status list.
    default:
      return decision;
  }
}

const Body = z.object({
  decision: z.enum(["accept", "decline", "defer", "standby", "reserve"]),
  rationale: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 10, "Rationale is required (at least 10 characters)"),
  // overrideQuality is whether the lead is overriding a below_standard quality result
  override: z.boolean().optional().default(false),
  overrideReason: z.string().optional(),
  override_quality_standard: z.boolean().optional(),
  override_reason: z.string().optional(),
}).superRefine((data, ctx) => {
  const isOverride = Boolean(data.override || data.override_quality_standard);
  if (isOverride) {
    const reason = (data.overrideReason ?? data.override_reason ?? "").trim();
    if (reason.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Overriding the quality standard requires a reason (at least 10 characters)",
        path: ["overrideReason"],
      });
    }
  }
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  }

  const token = getToken(req);
  if (!token) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const evalRows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (evalRows.length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const evaluator = evalRows[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return Response.json({ error: "Only leads can record decisions", code: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.errors[0]?.message ?? "Invalid request", code: "bad_request" }, { status: 400 });
  }

  const decision = parsed.data.decision;
  const rationale = (parsed.data.rationale as string).trim();
  const isOverride = Boolean(parsed.data.override || parsed.data.override_quality_standard);
  const overrideReasonRaw = (parsed.data.overrideReason ?? parsed.data.override_reason ?? "") as string;
  const overrideReason = overrideReasonRaw.trim() || null;

  // Fetch application
  const appRows = (await sql`select id, ref_code, wave_id, status from applications where id = ${id} limit 1`) as any[];
  if (appRows.length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  const app = appRows[0] as { id: string; ref_code: string; wave_id: string; status: string };
  const previousStatus = app.status;

  // Optional quality check: if app is below_standard and decision is accept, enforce override when caller indicates override.
  // We do not block a lead from accepting a below_standard app without override flag — but if they set override=true, we already required a reason.
  // Additionally, if the quality is below_standard and decision is accept AND isOverride is false, we allow but record that quality was not overridden.
  // If the caller sends override=true without a reason, zod already rejected.

  // Fetch submitted assessments to compute qualityStatus for audit payload (informative)
  const submittedRows = (await sql`
    select focus_score, content_score, interactivity_score, credibility_score, state, evaluator_id
    from assessments where application_id = ${id} and state = 'submitted'
  `) as any[];

  let qualityStatus: string | null = null;
  try {
    const inputs: ScoringAssessment[] = submittedRows.map((r: any) => ({
      evaluatorId: r.evaluator_id,
      state: r.state,
      focus_score: r.focus_score,
      content_score: r.content_score,
      interactivity_score: r.interactivity_score,
      credibility_score: r.credibility_score,
    }));
    const agg = computeAggregates(inputs as any);
    qualityStatus = agg.qualityStatus;
  } catch {
    qualityStatus = null;
  }

  // If quality is below_standard and decision is accept, and isOverride is false, we do NOT block — but the UI should have warned.
  // No server block needed per spec (override reason only required WHEN overriding). Just audit.

  const newStatus = mapDecisionToStatus(decision);

  // Insert panel_decisions row
  try {
    await sql`
      insert into panel_decisions (application_id, decision, rationale, override_quality_standard, override_reason, decided_by)
      values (${id}, ${decision}, ${rationale}, ${isOverride}, ${overrideReason}, ${evaluator.id})
    `;
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    // If panel_decisions table missing (shouldn't), surface 500
    return Response.json({ error: "Failed to record decision: " + msg, code: "server_error" }, { status: 500 });
  }

  // Update application status — keep withdrawn distinct? Any decision can be recorded; status moves to mapped value.
  // If newStatus equals previous, we still update updated_at and record audit.
  try {
    await sql`update applications set status = ${newStatus}, updated_at = now() where id = ${id}`;
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    // Constraint violation if newStatus not in allowed enum (e.g. reserve). Map reserve already to standby, so unlikely.
    return Response.json({ error: "Failed to update application status: " + msg, code: "server_error" }, { status: 500 });
  }

  const ip = getClientIp(req) ?? getClientIpFromRequest(req);

  // Audit: decision with previous and new status, rationale, override
  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "application.decision",
    entity: "application",
    entityId: id,
    payload: {
      decision,
      rationale,
      previousStatus,
      newStatus,
      qualityStatus,
      override: isOverride,
      overrideReason: overrideReason ?? undefined,
      ref_code: app.ref_code,
    },
    ip,
  });

  // Separate audit for override if present (so filter by action finds it)
  if (isOverride) {
    await writeAudit({
      actorId: evaluator.id,
      actorName: evaluator.name,
      action: "application.quality_override",
      entity: "application",
      entityId: id,
      payload: {
        decision,
        rationale,
        previousStatus,
        newStatus,
        qualityStatus,
        overrideReason,
        ref_code: app.ref_code,
      },
      ip,
    });
  }

  // Return updated application and last decision
  const updatedRows = (await sql`select id, ref_code, wave_id, status from applications where id = ${id} limit 1`) as any[];
  const updated = updatedRows[0];

  const lastDecisionRows = (await sql`
    select id, decision, rationale, override_quality_standard, override_reason, decided_by, decided_at
    from panel_decisions where application_id = ${id} order by decided_at desc limit 1
  `) as any[];

  return Response.json(
    {
      ok: true,
      application: updated,
      decision: lastDecisionRows[0] ?? null,
      previousStatus,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
