import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "./lib/auth";

const PUBLIC_PATHS = ["/login", "/who", "/api/auth/login", "/api/auth/select-evaluator", "/api/auth/logout", "/api/evaluators", "/api/me"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // allow static and public
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("fa27_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const payload = await verifySession(token);
  if (!payload || !payload.authed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!payload.evaluatorId && pathname !== "/who" && !pathname.startsWith("/api/auth")) {
    return NextResponse.redirect(new URL("/who", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
