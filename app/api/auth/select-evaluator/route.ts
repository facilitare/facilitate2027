import { z } from "zod";
import { verifySession, signSession, sessionCookie, verifyAdminPassword, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";

const Body = z.object({ evaluatorId: z.string().uuid(), adminPassword: z.string().optional() });

export async function POST(req: Request) {
  const token = req.headers.get("cookie")?.match(/fa27_session=([^;]+)/)?.[1];
  if (!token) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const payload = await verifySession(token);
  if (!payload || !payload.authed) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request", code: "bad_request" }, { status: 400 });

  const sql = getSql();
  const rows = await sql`select id, name, role from evaluators where id = ${parsed.data.evaluatorId} and active = true`;
  if ((rows as any[]).length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const evaluator = (rows as any[])[0];

  if (evaluator.role === "lead") {
    if (!parsed.data.adminPassword) return Response.json({ error: "Admin password required for lead", code: "unauthorized" }, { status: 401 });
    const ok = await verifyAdminPassword(parsed.data.adminPassword);
    if (!ok) return Response.json({ error: "Incorrect admin password", code: "unauthorized" }, { status: 401 });
  }

  const newToken = await signSession({ authed: true, evaluatorId: evaluator.id, role: evaluator.role });
  return new Response(JSON.stringify({ ok: true, evaluator }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(newToken) },
  });
}
