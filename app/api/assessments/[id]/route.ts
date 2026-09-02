import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

const PatchBody = z.object({
  focus_score: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]).optional(),
  content_score: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]).optional(),
  interactivity_score: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]).optional(),
  credibility_score: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]).optional(),
  focus_no_evidence: z.boolean().optional(),
  content_no_evidence: z.boolean().optional(),
  interactivity_no_evidence: z.boolean().optional(),
  credibility_no_evidence: z.boolean().optional(),
  feedback_liked: z.string().max(5000).optional().nullable(),
  feedback_improve: z.string().max(5000).optional().nullable(),
  private_note: z.string().max(5000).optional().nullable(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function auth(req: Request) {
  const token = getSessionFromRequest(req);
  if (!token) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  }
  const sql = getSql();
  const rows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`;
  if ((rows as any[]).length === 0) {
    return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) } as const;
  }
  const evaluator = (rows as any[])[0] as { id: string; name: string; role: string };
  return { evaluator, sql } as const;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  const a = await auth(req);
  if ("error" in a) return a.error;
  const { evaluator, sql } = a as any;

  const assessRows = await sql`
    select id, application_id, evaluator_id, state,
      focus_score, content_score, interactivity_score, credibility_score,
      focus_no_evidence, content_no_evidence, interactivity_no_evidence, credibility_no_evidence,
      feedback_liked, feedback_improve, private_note, recusal_reason,
      assigned_at, updated_at, submitted_at
    from assessments where id = ${id} limit 1
  `;
  if ((assessRows as any[]).length === 0) return Response.json({ error: "Assessment not found", code: "not_found" }, { status: 404 });
  const assessment = (assessRows as any[])[0];

  // Ownership: own assessment or lead
  if (assessment.evaluator_id !== evaluator.id && evaluator.role !== "lead") {
    return Response.json({ error: "Not your assessment", code: "forbidden" }, { status: 403 });
  }

  // Application — round1 without q17/q18, with redaction substitution
  const appRows = await sql`
    select
      id, ref_code, wave_id, q11_theme,
      q4_session_provides, q4_session_provides_other,
      q5_audience, q5_audience_other, q6_audience_detail,
      q7_about_session, q7b_benefits, q8_group_setup, q8_group_setup_other,
      q9_room_layout, q10_delivery_mode, q12_timekeeping,
      q13_participation_level, q14_methods, q14_methods_other,
      q15_first_ten_minutes, q16_pathway,
      q19_large_groups_english,
      redacted_q7, redacted_q7b, redacted_q16, redacted_q19
    from applications where id = ${assessment.application_id} limit 1
  `;
  if ((appRows as any[]).length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  const row = (appRows as any[])[0];
  const application: Record<string, unknown> = {
    id: row.id,
    ref_code: row.ref_code,
    wave_id: row.wave_id,
    q11_theme: row.q11_theme,
    q4_session_provides: row.q4_session_provides,
    q4_session_provides_other: row.q4_session_provides_other,
    q5_audience: row.q5_audience,
    q5_audience_other: row.q5_audience_other,
    q6_audience_detail: row.q6_audience_detail,
    q7_about_session: row.redacted_q7 ?? row.q7_about_session,
    q7b_benefits: row.redacted_q7b ?? row.q7b_benefits,
    q8_group_setup: row.q8_group_setup,
    q8_group_setup_other: row.q8_group_setup_other,
    q9_room_layout: row.q9_room_layout,
    q10_delivery_mode: row.q10_delivery_mode,
    q12_timekeeping: row.q12_timekeeping,
    q13_participation_level: row.q13_participation_level,
    q14_methods: row.q14_methods,
    q14_methods_other: row.q14_methods_other,
    q15_first_ten_minutes: row.q15_first_ten_minutes,
    q16_pathway: row.redacted_q16 ?? row.q16_pathway,
    q19_large_groups_english: row.redacted_q19 ?? row.q19_large_groups_english,
  };
  // Deliberately absent: q17_iaf_member, q18_iaf_qualification

  // Settings: session_minutes
  let sessionMinutes = 50;
  try {
    const s = await sql`select value from settings where key = 'session_minutes'`;
    const v = (s as any[])[0]?.value;
    if (v != null) sessionMinutes = typeof v === "number" ? v : Number(v);
    if (isNaN(sessionMinutes)) sessionMinutes = 50;
  } catch {}

  return Response.json({ assessment, application, settings: { session_minutes: sessionMinutes } }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  const a = await auth(req);
  if ("error" in a) return a.error;
  const { evaluator, sql } = a as any;

  const rows = await sql`select id, evaluator_id, state from assessments where id = ${id} limit 1`;
  if ((rows as any[]).length === 0) return Response.json({ error: "Assessment not found", code: "not_found" }, { status: 404 });
  const existing = (rows as any[])[0] as { id: string; evaluator_id: string; state: string };
  if (existing.evaluator_id !== evaluator.id && evaluator.role !== "lead") {
    return Response.json({ error: "Not your assessment", code: "forbidden" }, { status: 403 });
  }
  if (existing.state === "submitted") {
    return Response.json({ error: "Already submitted — immutable", code: "conflict" }, { status: 409 });
  }
  if (existing.state === "recused") {
    return Response.json({ error: "Already recused", code: "conflict" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }

  // Strict filter: reject q17/q18 if sent
  if (body && typeof body === "object" && ("q17_iaf_member" in (body as any) || "q18_iaf_qualification" in (body as any))) {
    return Response.json({ error: "q17/q18 not patchable", code: "bad_request" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", code: "bad_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  // Load full existing to compute merges and no_evidence forcing
  const fullRows = await sql`
    select focus_score, content_score, interactivity_score, credibility_score,
      focus_no_evidence, content_no_evidence, interactivity_no_evidence, credibility_no_evidence,
      feedback_liked, feedback_improve, private_note, state
    from assessments where id = ${id} limit 1
  `;
  const cur = (fullRows as any[])[0];

  // Compute intended values — if key not in payload, keep current
  function resolveScore(key: keyof typeof d, curVal: number | null, noEvKey: string, newNoEv?: boolean, newScore?: number | null) {
    const finalNoEv = newNoEv !== undefined ? newNoEv : cur[noEvKey];
    let finalScore: number | null;
    if (newScore !== undefined) finalScore = newScore;
    else finalScore = curVal;
    if (finalNoEv) finalScore = 0;
    return { finalScore, finalNoEv };
  }

  const f = resolveScore("focus_score", cur.focus_score, "focus_no_evidence", d.focus_no_evidence, d.focus_score);
  const c = resolveScore("content_score", cur.content_score, "content_no_evidence", d.content_no_evidence, d.content_score);
  const inter = resolveScore("interactivity_score", cur.interactivity_score, "interactivity_no_evidence", d.interactivity_no_evidence, d.interactivity_score);
  const cred = resolveScore("credibility_score", cur.credibility_score, "credibility_no_evidence", d.credibility_no_evidence, d.credibility_score);

  // If any no_evidence newly true, force score 0 regardless of d's score; already handled. If no_evidence true and payload tried to set score !=0, we coerce to 0 (already)

  const feedback_liked = d.feedback_liked !== undefined ? d.feedback_liked : cur.feedback_liked;
  const feedback_improve = d.feedback_improve !== undefined ? d.feedback_improve : cur.feedback_improve;
  const private_note = d.private_note !== undefined ? d.private_note : cur.private_note;

  const newState = cur.state === "assigned" ? "draft" : cur.state;

  await sql`
    update assessments set
      focus_score = ${f.finalScore},
      content_score = ${c.finalScore},
      interactivity_score = ${inter.finalScore},
      credibility_score = ${cred.finalScore},
      focus_no_evidence = ${f.finalNoEv},
      content_no_evidence = ${c.finalNoEv},
      interactivity_no_evidence = ${inter.finalNoEv},
      credibility_no_evidence = ${cred.finalNoEv},
      feedback_liked = ${feedback_liked},
      feedback_improve = ${feedback_improve},
      private_note = ${private_note},
      state = ${newState},
      updated_at = now(),
      first_opened_at = coalesce(first_opened_at, now())
    where id = ${id}
  `;

  const updated = await sql`
    select id, application_id, evaluator_id, state,
      focus_score, content_score, interactivity_score, credibility_score,
      focus_no_evidence, content_no_evidence, interactivity_no_evidence, credibility_no_evidence,
      feedback_liked, feedback_improve, private_note, updated_at, submitted_at
    from assessments where id = ${id} limit 1
  `;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;
  await writeAudit({ actorId: evaluator.id, actorName: evaluator.name, action: "assessment.save_draft", entity: "assessment", entityId: id, payload: d as any, ip });

  return Response.json({ assessment: (updated as any[])[0] });
}
