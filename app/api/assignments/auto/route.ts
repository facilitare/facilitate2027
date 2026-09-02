import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { autoAssign } from "@/lib/assignment";

const Body = z.object({
  waveId: z.string().uuid(),
  perApplication: z.number().int().min(1).max(6).optional(),
});

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
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
    return Response.json({ error: "Only leads can auto-assign", code: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request", code: "bad_request" }, { status: 400 });

  const waveCheck = await sql`select id from waves where id = ${parsed.data.waveId}`;
  if ((waveCheck as any[]).length === 0) return Response.json({ error: "Wave not found", code: "not_found" }, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;

  const result = await autoAssign({
    waveId: parsed.data.waveId,
    perApplication: parsed.data.perApplication,
    actorId: evaluator.id,
    actorName: evaluator.name,
    ip,
  });

  return Response.json(result);
}
