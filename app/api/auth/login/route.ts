import { z } from "zod";
import { verifyAppPassword, verifyAdminPassword, signSession, sessionCookie, checkRateLimit, recordFail, resetAttempts, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return Response.json({ error: "Too many attempts, try again later", code: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Password required", code: "bad_request" }, { status: 400 });
  }
  const pw = parsed.data.password;
  // Admin shortcut: iafeme at login → direct lead session (no second password)
  const isAdmin = await verifyAdminPassword(pw);
  if (isAdmin) {
    resetAttempts(ip);
    const sql = getSql();
    const rows = await sql`select id, role from evaluators where role='lead' and active=true limit 1`;
    const lead = (rows as any[])[0];
    if (!lead) return Response.json({ error: "No lead configured", code: "not_found" }, { status: 500 });
    const token = await signSession({ authed: true, evaluatorId: lead.id, role: lead.role });
    return new Response(JSON.stringify({ ok: true, role: "lead", directAdmin: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(token) },
    });
  }
  const ok = await verifyAppPassword(pw);
  if (!ok) {
    recordFail(ip);
    return Response.json({ error: "Incorrect password", code: "unauthorized" }, { status: 401 });
  }
  resetAttempts(ip);
  const token = await signSession({ authed: true });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(token) },
  });
}
