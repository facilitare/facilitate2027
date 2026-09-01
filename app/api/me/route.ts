import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";

export async function GET(req: Request) {
  const token = req.headers.get("cookie")?.match(/fa27_session=([^;]+)/)?.[1];
  if (!token) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const payload = await verifySession(token);
  if (!payload || !payload.authed) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  if (!payload.evaluatorId) return Response.json({ evaluator: null, role: null, authed: true });
  const sql = getSql();
  const rows = await sql`select id, name, email, role from evaluators where id = ${payload.evaluatorId}`;
  if (!(rows as any[]).length) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const evaluator = (rows as any[])[0];
  const counts = await sql`select count(*)::int as total, count(*) filter (where state='submitted')::int as submitted from assessments where evaluator_id = ${payload.evaluatorId}`;
  return Response.json({ evaluator, role: payload.role, counts: (counts as any[])[0] });
}
