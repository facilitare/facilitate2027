import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

const Body = z.object({
  reason: z.string().min(1).max(2000).optional(),
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
  if (!uuidRe.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });

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
    return Response.json({ error: "Only leads can dismiss flags", code: "forbidden" }, { status: 403 });
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

  const appRows = await sql`select id, anonymity_flag, anonymity_notes from applications where id = ${id}`;
  if ((appRows as any[]).length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });

  const reason = parsed.data.reason ?? "dismissed by lead";

  // Clear the flag — keeps notes for history, but allows assignment
  await sql`update applications set anonymity_flag = false, updated_at = now() where id = ${id}`;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;

  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "application.dismiss_flag",
    entity: "application",
    entityId: id,
    payload: { reason, dismissedBy: evaluator.id },
    ip,
  });

  return Response.json({ ok: true, reason });
}
