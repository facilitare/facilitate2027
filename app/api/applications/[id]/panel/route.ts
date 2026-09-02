import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";
import { computeAggregates, type ScoringAssessment } from "@/lib/scoring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

async function requireAuth(req: Request) {
  const token = getSessionFromRequest(req);
  if (!token) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) as Response, session: null, evaluator: null };
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) as Response, session: null, evaluator: null };
  }
  const sql = getSql();
  const evalRows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (evalRows.length === 0) {
    return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) as Response, session: null, evaluator: null };
  }
  const evaluator = evalRows[0] as { id: string; name: string; role: string };
  return { error: null as Response | null, session, evaluator };
}

async function fetchApplication(sql: any, id: string) {
  // Try with panel_discussion; if column missing, fallback without it
  try {
    const rows = (await sql`select id, ref_code, wave_id, status, panel_discussion from applications where id = ${id} limit 1`) as any[];
    return rows;
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("panel_discussion") || msg.includes("42703") || msg.includes("does not exist")) {
      const rows = (await sql`select id, ref_code, wave_id, status from applications where id = ${id} limit 1`) as any[];
      // Augment with null panel_discussion so caller has uniform shape
      return (rows as any[]).map((r: any) => ({ ...r, panel_discussion: null }));
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// GET — panel data (R2 enforced)
// ---------------------------------------------------------------------------
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  const { evaluator } = auth as { evaluator: { id: string; name: string; role: string } };
  const isLead = evaluator.role === "lead";
  const sql = getSql();

  // Application existence check
  const appRows = await fetchApplication(sql, id);
  if (appRows.length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  const app = appRows[0] as { id: string; ref_code: string; wave_id: string; status: string; panel_discussion: string | null };

  // R2 — server check: 403 unless own assessment is submitted or requester is lead
  if (!isLead) {
    const own = (await sql`select state from assessments where application_id = ${id} and evaluator_id = ${evaluator.id} limit 1`) as any[];
    const ownState = own.length ? (own[0] as any).state : null;
    if (ownState !== "submitted") {
      return Response.json(
        { error: "Panel view requires your own submitted assessment. Submit your assessment first or contact a lead.", code: "forbidden", r2: true },
        { status: 403 }
      );
    }
  }

  // Fetch submitted assessments with evaluator names
  const assessments = (await sql`
    select
      a.id, a.evaluator_id, e.name as evaluator_name, a.state,
      a.focus_score, a.content_score, a.interactivity_score, a.credibility_score,
      a.focus_no_evidence, a.content_no_evidence, a.interactivity_no_evidence, a.credibility_no_evidence,
      a.feedback_liked, a.feedback_improve, a.submitted_at, a.updated_at
    from assessments a
    join evaluators e on e.id = a.evaluator_id
    where a.application_id = ${id} and a.state = 'submitted'
    order by e.name asc
  `) as any[];

  // Compute aggregates via lib/scoring.ts (verifies mean equals library)
  const scoringInputs: ScoringAssessment[] = assessments.map((a: any) => ({
    evaluatorId: a.evaluator_id,
    state: a.state,
    focus_score: a.focus_score,
    content_score: a.content_score,
    interactivity_score: a.interactivity_score,
    credibility_score: a.credibility_score,
  }));
  const aggregates = computeAggregates(scoringInputs);

  // Settings: iaf_bonus_mode for label
  let iafBonusMode: "additive" | "tiebreak" = "additive";
  try {
    const r = await sql`select value from settings where key = 'iaf_bonus_mode'`;
    const v = (r as any[])[0]?.value;
    if (v != null) {
      const parsed = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v;
      if (parsed === "additive" || parsed === "tiebreak") iafBonusMode = parsed;
    }
  } catch {}

  return Response.json(
    {
      application: {
        id: app.id,
        ref_code: app.ref_code,
        wave_id: app.wave_id,
        status: app.status,
        panel_discussion: app.panel_discussion ?? null,
      },
      settings: { iaf_bonus_mode: iafBonusMode },
      assessments: assessments.map((a: any) => ({
        id: a.id,
        evaluator_id: a.evaluator_id,
        evaluator_name: a.evaluator_name,
        state: a.state,
        focus_score: a.focus_score,
        content_score: a.content_score,
        interactivity_score: a.interactivity_score,
        credibility_score: a.credibility_score,
        focus_no_evidence: a.focus_no_evidence,
        content_no_evidence: a.content_no_evidence,
        interactivity_no_evidence: a.interactivity_no_evidence,
        credibility_no_evidence: a.credibility_no_evidence,
        feedback_liked: a.feedback_liked,
        feedback_improve: a.feedback_improve,
        submitted_at: a.submitted_at,
        updated_at: a.updated_at,
      })),
      aggregates,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// ---------------------------------------------------------------------------
// POST — append panel discussion comment (same R2 gate)
// ---------------------------------------------------------------------------
const PostBody = z.object({
  message: z.string().min(1, "Message required").max(5000, "Message too long (max 5000)").transform((s) => s.trim()).refine((s) => s.length >= 1, "Message required"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  const { evaluator } = auth as { evaluator: { id: string; name: string; role: string } };
  const isLead = evaluator.role === "lead";
  const sql = getSql();

  // application exists
  const appRows = await fetchApplication(sql, id);
  if (appRows.length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });

  // R2 gate identical to GET
  if (!isLead) {
    const own = (await sql`select state from assessments where application_id = ${id} and evaluator_id = ${evaluator.id} limit 1`) as any[];
    const ownState = own.length ? (own[0] as any).state : null;
    if (ownState !== "submitted") {
      return Response.json(
        { error: "Panel view requires your own submitted assessment.", code: "forbidden" },
        { status: 403 }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.errors[0]?.message ?? "Invalid request", code: "bad_request" }, { status: 400 });

  const message = parsed.data.message;
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const entry = `[${evaluator.name} — ${timestamp}]\n${message}`;

  // Append to panel_discussion — create column on-the-fly if missing
  let existing: string | null = (appRows[0] as any).panel_discussion ?? null;
  // If we earlier fell back (no column), existing is null; still attempt ALTER
  try {
    const currentRows = await fetchApplication(sql, id);
    existing = (currentRows[0] as any).panel_discussion ?? null;
  } catch {
    // ignore
  }

  const newDiscussion = existing && existing.trim().length > 0 ? existing + "\n\n" + entry : entry;

  try {
    await sql`update applications set panel_discussion = ${newDiscussion}, updated_at = now() where id = ${id}`;
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("panel_discussion") || msg.includes("42703") || msg.includes("does not exist")) {
      // Try to add column then retry
      try {
        await sql`alter table applications add column if not exists panel_discussion text`;
        await sql`update applications set panel_discussion = ${newDiscussion}, updated_at = now() where id = ${id}`;
      } catch (e2: any) {
        return Response.json({ error: "Failed to save discussion (migration required)", code: "server_error" }, { status: 500 });
      }
    } else {
      throw e;
    }
  }

  // Audit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;
  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "panel_discussion.append",
    entity: "application",
    entityId: id,
    payload: { messagePreview: message.slice(0, 120) },
    ip,
  });

  // Return refreshed state (reuse GET logic without re-checking R2 — already passed)
  const assessments = (await sql`
    select
      a.id, a.evaluator_id, e.name as evaluator_name, a.state,
      a.focus_score, a.content_score, a.interactivity_score, a.credibility_score,
      a.focus_no_evidence, a.content_no_evidence, a.interactivity_no_evidence, a.credibility_no_evidence,
      a.feedback_liked, a.feedback_improve, a.submitted_at, a.updated_at
    from assessments a
    join evaluators e on e.id = a.evaluator_id
    where a.application_id = ${id} and a.state = 'submitted'
    order by e.name asc
  `) as any[];

  const scoringInputs2: ScoringAssessment[] = assessments.map((a: any) => ({
    evaluatorId: a.evaluator_id,
    state: a.state,
    focus_score: a.focus_score,
    content_score: a.content_score,
    interactivity_score: a.interactivity_score,
    credibility_score: a.credibility_score,
  }));
  const aggregates = computeAggregates(scoringInputs2);

  let iafBonusModePost: "additive" | "tiebreak" = "additive";
  try {
    const r = await sql`select value from settings where key = 'iaf_bonus_mode'`;
    const v = (r as any[])[0]?.value;
    if (v != null) {
      const parsed = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v;
      if (parsed === "additive" || parsed === "tiebreak") iafBonusModePost = parsed;
    }
  } catch {}
  return Response.json(
    {
      application: {
        id,
        ref_code: (appRows[0] as any).ref_code,
        wave_id: (appRows[0] as any).wave_id,
        status: (appRows[0] as any).status,
        panel_discussion: newDiscussion,
      },
      settings: { iaf_bonus_mode: iafBonusModePost },
      assessments: assessments.map((a: any) => ({
        id: a.id,
        evaluator_id: a.evaluator_id,
        evaluator_name: a.evaluator_name,
        state: a.state,
        focus_score: a.focus_score,
        content_score: a.content_score,
        interactivity_score: a.interactivity_score,
        credibility_score: a.credibility_score,
        focus_no_evidence: a.focus_no_evidence,
        content_no_evidence: a.content_no_evidence,
        interactivity_no_evidence: a.interactivity_no_evidence,
        credibility_no_evidence: a.credibility_no_evidence,
        feedback_liked: a.feedback_liked,
        feedback_improve: a.feedback_improve,
        submitted_at: a.submitted_at,
        updated_at: a.updated_at,
      })),
      aggregates,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
