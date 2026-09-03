import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

const BodySchema = z.object({}).passthrough();

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  const token = getSessionFromRequest(req);
  if (!token) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const sql = getSql();
  const evalRows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`;
  if ((evalRows as any[]).length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const evaluator = (evalRows as any[])[0] as { id: string; name: string; role: string };

  const rows = await sql`
    select id, evaluator_id, state, focus_score, content_score, interactivity_score, credibility_score,
      feedback_liked, feedback_improve, application_id
    from assessments where id = ${id} limit 1
  `;
  if ((rows as any[]).length === 0) return Response.json({ error: "Assessment not found", code: "not_found" }, { status: 404 });
  const a = (rows as any[])[0];
  if (a.evaluator_id !== evaluator.id && evaluator.role !== "lead") {
    return Response.json({ error: "Not your assessment", code: "forbidden" }, { status: 403 });
  }
  if (a.state === "submitted") return Response.json({ error: "Already submitted — immutable", code: "conflict" }, { status: 409 });
  if (a.state === "recused") return Response.json({ error: "Already recused", code: "conflict" }, { status: 409 });

  // zod validation for body (no required fields, but validates JSON shape)
  let rawBody: unknown = {};
  try {
    const text = await req.text();
    if (text) rawBody = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const bodyParsed = BodySchema.safeParse(rawBody);
  if (!bodyParsed.success) return Response.json({ error: "Invalid request", code: "bad_request" }, { status: 400 });

  // Validate completeness — only scores required, feedback optional
  const missing: string[] = [];
  if (a.focus_score == null) missing.push("focus");
  if (a.content_score == null) missing.push("content");
  if (a.interactivity_score == null) missing.push("interactivity");
  if (a.credibility_score == null) missing.push("credibility");
  if (missing.length > 0) {
    return Response.json({ error: `Incomplete: ${missing.join(", ")}`, code: "validation_failed", missing }, { status: 422 });
  }

  // Attempt submit — DB constraint will also enforce
  try {
    await sql`update assessments set state='submitted', submitted_at=now(), updated_at=now() where id=${id} and state in ('assigned','draft')`;
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Submit failed", code: "db_error" }, { status: 422 });
  }

  const updated = await sql`select id, state, focus_score, content_score, interactivity_score, credibility_score, feedback_liked, feedback_improve, submitted_at from assessments where id=${id} limit 1`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;
  await writeAudit({ actorId: evaluator.id, actorName: evaluator.name, action: "assessment.submit", entity: "assessment", entityId: id, payload: { application_id: a.application_id }, ip });

  return Response.json({ assessment: (updated as any[])[0] });
}
