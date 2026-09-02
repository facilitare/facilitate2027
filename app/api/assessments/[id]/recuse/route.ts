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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ reason: z.string().max(2000).optional().nullable() });

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

  const rows = await sql`select id, evaluator_id, state, application_id from assessments where id=${id} limit 1`;
  if ((rows as any[]).length === 0) return Response.json({ error: "Assessment not found", code: "not_found" }, { status: 404 });
  const a = (rows as any[])[0];
  if (a.evaluator_id !== evaluator.id && evaluator.role !== "lead") {
    return Response.json({ error: "Not your assessment", code: "forbidden" }, { status: 403 });
  }
  if (a.state === "submitted") return Response.json({ error: "Already submitted — cannot recuse", code: "conflict" }, { status: 409 });
  if (a.state === "recused") {
    // idempotent — return current
    const cur = await sql`select id, state, recusal_reason from assessments where id=${id} limit 1`;
    return Response.json({ assessment: (cur as any[])[0] });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid reason", code: "bad_request" }, { status: 400 });
  const reason = parsed.data.reason?.trim() || null;

  await sql`update assessments set state='recused', recusal_reason=${reason}, updated_at=now() where id=${id}`;

  const updated = await sql`select id, state, recusal_reason, updated_at from assessments where id=${id} limit 1`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;
  await writeAudit({ actorId: evaluator.id, actorName: evaluator.name, action: "assessment.recuse", entity: "assessment", entityId: id, payload: { application_id: a.application_id, reason }, ip });

  return Response.json({ assessment: (updated as any[])[0] });
}
