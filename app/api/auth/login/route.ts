import { z } from "zod";
import { verifyAppPassword, signSession, sessionCookie, checkRateLimit, recordFail, resetAttempts, getClientIp } from "@/lib/auth";

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
  const ok = await verifyAppPassword(parsed.data.password);
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
