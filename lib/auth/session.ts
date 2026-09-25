/**
 * Signed session cookie (Web Crypto only — shared by the proxy and route handlers).
 * Token = base64url(payload) "." base64url(HMAC-SHA256(payload, secret)).
 */

export const SESSION_COOKIE = "qalaa_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Sessions with less than this much life left are re-issued (sliding renewal). */
export const SESSION_RENEW_BELOW_MS = SESSION_TTL_MS / 2;

export interface SessionPayload {
  /** issued at (epoch ms) */
  iat: number;
  /** expires at (epoch ms) */
  exp: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signSession(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS): Promise<string> {
  const payload: SessionPayload = { iat: now, exp: now + ttlMs };
  const body = enc.encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), body);
  return `${b64url(body)}.${b64url(new Uint8Array(sig))}`;
}

/** Returns the payload when the signature is valid and the session has not expired; otherwise null. */
export async function verifySession(secret: string, token: string | undefined | null, now = Date.now()): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = unb64url(token.slice(0, dot));
  const sig = unb64url(token.slice(dot + 1));
  if (!body || !sig || sig.length !== 32) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sig, body);
  if (!ok) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(dec.decode(body));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const { iat, exp } = payload as Partial<SessionPayload>;
  if (typeof iat !== "number" || typeof exp !== "number") return null;
  if (exp <= now || iat > now + 60_000) return null;
  return { iat, exp };
}

export function shouldRenew(session: SessionPayload, now = Date.now()): boolean {
  return session.exp - now < SESSION_RENEW_BELOW_MS;
}

/** Set-Cookie attributes shared by login, renewal and logout. */
export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
}
