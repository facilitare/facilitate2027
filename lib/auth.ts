import bcrypt from "bcryptjs";
import * as jose from "jose";

const SESSION_COOKIE = "fa27_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET missing");
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  authed: boolean;
  evaluatorId?: string;
  role?: "assessor" | "lead";
  iat?: number;
  exp?: number;
};

export async function verifyAppPassword(password: string): Promise<boolean> {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) throw new Error("APP_PASSWORD_HASH missing");
  return bcrypt.compare(password, hash);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) throw new Error("ADMIN_PASSWORD_HASH missing");
  return bcrypt.compare(password, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secret = getSecret();
  return new jose.SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecret();
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  // HttpOnly Secure SameSite Lax
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export const COOKIE_NAME = SESSION_COOKIE;

// in-memory rate limiting: 5 fails per IP per 10min -> 429 for 15min
type Attempt = { fails: number; firstFailAt: number; blockedUntil?: number };
const attempts = new Map<string, Attempt>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const a = attempts.get(ip);
  if (a?.blockedUntil && now < a.blockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((a.blockedUntil - now) / 1000) };
  }
  if (a && a.blockedUntil && now >= a.blockedUntil) {
    attempts.delete(ip);
  }
  return { allowed: true };
}

export function recordFail(ip: string): void {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.firstFailAt > 10 * 60 * 1000) {
    attempts.set(ip, { fails: 1, firstFailAt: now });
    return;
  }
  a.fails += 1;
  if (a.fails >= 5) {
    a.blockedUntil = now + 15 * 60 * 1000;
  }
}

export function resetAttempts(ip: string): void {
  attempts.delete(ip);
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
