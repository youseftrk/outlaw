/**
 * Auth gate (Node runtime). No-op when no password is configured; otherwise
 * page requests without a valid `qalaa_session` redirect to /login and API
 * requests get 401. Valid sessions in their second half are re-issued.
 */
import { NextResponse, type NextRequest } from "next/server";
import { decide } from "@/lib/auth/gate";
import { SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions, shouldRenew, signSession, verifySession } from "@/lib/auth/session";
import { readProxyAuthState } from "@/server/auth";

export async function proxy(request: NextRequest) {
  const { enabled, sessionSecret } = readProxyAuthState();
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = enabled && sessionSecret ? await verifySession(sessionSecret, token) : null;

  const d = decide({ pathname, enabled, authenticated: session !== null });
  if (d.kind === "unauthorized") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (d.kind === "redirect") return NextResponse.redirect(new URL(d.to, request.url));

  const res = NextResponse.next();
  if (session && sessionSecret && shouldRenew(session)) {
    res.cookies.set({
      name: SESSION_COOKIE,
      value: await signSession(sessionSecret),
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      ...sessionCookieOptions(request.nextUrl.protocol === "https:"),
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
