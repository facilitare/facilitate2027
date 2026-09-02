import { z } from "zod";
import { verifySession, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getToken(req: Request): string | null {
  const c = req.headers.get("cookie");
  if (!c) return null;
  const m = c.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

const Body = z.object({
  confirm: z.boolean().optional(),
});

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });

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
    return Response.json({ error: "Only leads can manage assignments", code: "forbidden" }, { status: 403 });
  }

  // Validate body — require confirm if assignment has draft
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    // empty body is ok
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request", code: "bad_request" }, { status: 400 });

  const row = (await sql`select id, application_id, evaluator_id, state, focus_score, content_score, interactivity_score, credibility_score, feedback_liked, feedback_improve from assessments where id = ${id} limit 1`) as any[];
  if (row.length === 0) return Response.json({ error: "Assignment not found", code: "not_found" }, { status: 404 });
  const a = row[0];
  if (a.state === "submitted") {
    return Response.json({ error: "Cannot remove submitted assessment", code: "conflict" }, { status: 409 });
  }

  const hasDraft =
    a.state === "draft" ||
    a.focus_score !== null ||
    a.content_score !== null ||
    a.interactivity_score !== null ||
    a.credibility_score !== null ||
    (a.feedback_liked && a.feedback_liked.trim().length > 0) ||
    (a.feedback_improve && a.feedback_improve.trim().length > 0);

  if (hasDraft && !parsed.data.confirm) {
    return Response.json(
      { error: "Assignment has draft content — confirm deletion", code: "confirm_required", hasDraft: true },
      { status: 409 }
    );
  }

  await sql`delete from assessments where id = ${id}`;

  const ip = getClientIp(req);
  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "assignment.delete",
    entity: "assignment",
    entityId: id,
    payload: { applicationId: a.application_id, evaluatorId: a.evaluator_id, state: a.state, hadDraft: hasDraft },
    ip,
  });

  return Response.json({ ok: true, deletedId: id });
}
