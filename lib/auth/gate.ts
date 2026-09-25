/**
 * Pure gating decision used by proxy.ts (and unit-tested directly).
 * No Node or Next imports — runs anywhere.
 */

export const LOGIN_PATH = "/login";

// /api/messages/inbound authenticates itself (Twilio signature / shared secret).
const PUBLIC_EXACT = new Set(["/login", "/api/health", "/api/messages/inbound", "/icon.svg", "/favicon.ico"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/_next/", "/brand/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export type GateDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "unauthorized" };

export interface GateInput {
  pathname: string;
  /** auth is configured (password set via env or Settings) */
  enabled: boolean;
  /** request carries a valid session cookie */
  authenticated: boolean;
}

export function decide({ pathname, enabled, authenticated }: GateInput): GateDecision {
  if (pathname === LOGIN_PATH && (!enabled || authenticated)) return { kind: "redirect", to: "/" };
  if (!enabled || authenticated || isPublicPath(pathname)) return { kind: "allow" };
  if (pathname.startsWith("/api/")) return { kind: "unauthorized" };
  const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return { kind: "redirect", to: `${LOGIN_PATH}${next}` };
}

/** Only same-origin relative paths are honoured as post-login destinations. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/";
  return next;
}
