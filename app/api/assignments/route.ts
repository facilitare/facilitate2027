import { z } from "zod";
import { verifySession, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

function getToken(req: Request): string | null {
  const c = req.headers.get("cookie");
  if (!c) return null;
  const m = c.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

const Body = z.object({
  applicationId: z.string().uuid(),
  evaluatorId: z.string().uuid(),
});

export async function POST(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.errors[0]?.message ?? "Invalid request", code: "bad_request" }, { status: 400 });

  const { applicationId, evaluatorId } = parsed.data;

  // Validate application and target evaluator exist
  const appRows = (await sql`select id, wave_id, anonymity_flag from applications where id = ${applicationId} limit 1`) as any[];
  if (appRows.length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  const targetEval = (await sql`select id, name from evaluators where id = ${evaluatorId} and active = true limit 1`) as any[];
  if (targetEval.length === 0) return Response.json({ error: "Evaluator not found or inactive", code: "not_found" }, { status: 404 });

  if (appRows[0].anonymity_flag === true) {
    return Response.json({ error: "Application has anonymity flag — redact or dismiss before assignment", code: "conflict" }, { status: 409 });
  }

  // Check not already assigned and not recused
  const existing = (await sql`select id, state from assessments where application_id = ${applicationId} and evaluator_id = ${evaluatorId} limit 1`) as any[];
  if (existing.length > 0) {
    const state = existing[0].state;
    if (state === "recused") {
      return Response.json({ error: "Evaluator recused from this application — cannot reassign without clearing recusal", code: "conflict" }, { status: 409 });
    }
    return Response.json({ error: "Already assigned", code: "conflict" }, { status: 409 });
  }

  const inserted = (await sql`insert into assessments (application_id, evaluator_id, state) values (${applicationId}, ${evaluatorId}, 'assigned') returning id, application_id, evaluator_id, state, assigned_at`) as any[];
  await sql`update applications set status = 'scoring', updated_at = now() where id = ${applicationId} and status = 'imported'`;

  const ip = getClientIp(req);
  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "assignment.create",
    entity: "assignment",
    entityId: inserted[0].id,
    payload: { applicationId, evaluatorId, targetName: targetEval[0].name },
    ip,
  });

  return Response.json({ assignment: inserted[0] }, { status: 201 });
}
