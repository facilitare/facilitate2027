import { z } from "zod";
import { verifySession, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";
import { REDACT_FIELD_MAP, ALLOWED_REDACT_DB_COLUMNS } from "@/lib/anonymity";

const Body = z.object({
  field: z.string().min(1),
  text: z.string().min(1),
});

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  }

  const token = getSessionFromRequest(req);
  if (!token) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const evalRows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`;
  if ((evalRows as any[]).length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const evaluator = (evalRows as any[])[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return Response.json({ error: "Only leads can redact", code: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "field and text required", code: "bad_request" }, { status: 400 });

  const dbCol = REDACT_FIELD_MAP[parsed.data.field];
  if (!dbCol || !(ALLOWED_REDACT_DB_COLUMNS as readonly string[]).includes(dbCol)) {
    return Response.json({ error: `Invalid field. Allowed: q7_about_session, q7b_benefits, q16_pathway, q19_large_groups_english`, code: "bad_request" }, { status: 400 });
  }

  const appRows = await sql`select id from applications where id = ${id}`;
  if ((appRows as any[]).length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });

  const redactedText = parsed.data.text;

  // Update the specific redacted column — explicit column names, no dynamic SQL injection risk
  // We use a switch to keep SQL explicit and auditable (no string interpolation of column name)
  if (dbCol === "redacted_q7") {
    await sql`update applications set redacted_q7 = ${redactedText}, redacted_by = ${evaluator.id}, redacted_at = now(), anonymity_flag = false, updated_at = now() where id = ${id}`;
  } else if (dbCol === "redacted_q7b") {
    await sql`update applications set redacted_q7b = ${redactedText}, redacted_by = ${evaluator.id}, redacted_at = now(), anonymity_flag = false, updated_at = now() where id = ${id}`;
  } else if (dbCol === "redacted_q16") {
    await sql`update applications set redacted_q16 = ${redactedText}, redacted_by = ${evaluator.id}, redacted_at = now(), anonymity_flag = false, updated_at = now() where id = ${id}`;
  } else if (dbCol === "redacted_q19") {
    await sql`update applications set redacted_q19 = ${redactedText}, redacted_by = ${evaluator.id}, redacted_at = now(), anonymity_flag = false, updated_at = now() where id = ${id}`;
  }

  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "application.redact",
    entity: "application",
    entityId: id,
    payload: { field: parsed.data.field, dbColumn: dbCol, redactedBy: evaluator.id },
    ip: getClientIp(req),
  });

  return Response.json({ ok: true, field: parsed.data.field, dbColumn: dbCol });
}
