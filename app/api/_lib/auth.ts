/** Cookie helpers for route handlers (plain `Request`/`Response`). Private folder — not routed. */
import { SESSION_COOKIE, SESSION_TTL_MS, signSession, verifySession } from "@/lib/auth/session";
import { authEnabled, resolveSessionSecret } from "@/server/auth";

export function readSessionCookie(req: Request): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=");
  }
  return undefined;
}

/** True when auth is enabled and the request carries a valid session. */
export async function isAuthenticated(req: Request): Promise<boolean> {
  if (!authEnabled()) return false;
  const secret = resolveSessionSecret();
  if (!secret) return false;
  return (await verifySession(secret, readSessionCookie(req))) !== null;
}

function isSecure(req: Request): boolean {
  if (req.headers.get("x-forwarded-proto") === "https") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

function cookieString(value: string, maxAgeSec: number, req: Request): string {
  const parts = [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  if (isSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

/** Set-Cookie header value for a freshly signed session. */
export async function sessionSetCookie(req: Request): Promise<string | null> {
  const secret = resolveSessionSecret();
  if (!secret) return null;
  const token = await signSession(secret);
  return cookieString(token, Math.floor(SESSION_TTL_MS / 1000), req);
}

export function sessionClearCookie(req: Request): string {
  return cookieString("", 0, req);
}
