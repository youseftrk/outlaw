/**
 * Optional single-operator auth (Node side).
 *
 * Enabled when `QALAA_AUTH_PASSWORD` is set or `auth.passwordHash` exists in
 * `.data/secrets.json` (set from Settings → Access). The Settings hash wins
 * when both are present. With neither, every route is open (demo default).
 *
 * Session cookies are HMAC-signed with `auth.sessionSecret`, generated on
 * first boot and persisted next to the LLM key. The proxy cannot share the
 * in-memory store, so `readProxyAuthState()` re-reads the secrets file
 * (cached by mtime) — see proxy.ts.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { store, type QalaaSecrets } from "./store";
import { G } from "./shared";
import type { AuthSource } from "@/lib/types";

export const ENV_PASSWORD = "QALAA_AUTH_PASSWORD";

const SCRYPT_KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time compare of a plaintext against a `hashPassword()` string. */
export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

function envPassword(): string | undefined {
  const v = process.env[ENV_PASSWORD];
  return v ? v : undefined;
}

/** The env password is hashed once per process so login always runs the same scrypt path. */
function envPasswordHash(): string | undefined {
  const pw = envPassword();
  if (!pw) return undefined;
  const cached = G.__qalaaEnvPwHash;
  if (cached && cached.password === pw) return cached.hash;
  const hash = hashPassword(pw);
  G.__qalaaEnvPwHash = { password: pw, hash };
  return hash;
}

/** Session-secret fallback when nothing can be persisted (QALAA_NO_PERSIST / tests): derived from the env password. */
export function deriveSessionSecret(password: string): string {
  return createHash("sha256").update(`qalaa-session:${password}`).digest("hex");
}

export function authSource(secrets: QalaaSecrets = store.secrets): AuthSource {
  if (secrets.auth?.passwordHash) return "settings";
  if (envPassword()) return "env";
  return "off";
}

export function authEnabled(secrets: QalaaSecrets = store.secrets): boolean {
  return authSource(secrets) !== "off";
}

export function checkPassword(password: string): boolean {
  const source = authSource();
  if (source === "settings") return verifyPassword(password, store.secrets.auth?.passwordHash);
  if (source === "env") return verifyPassword(password, envPasswordHash());
  return false;
}

/**
 * HMAC secret for session cookies: the persisted one, else a freshly generated
 * and persisted one, else (nothing can be persisted) derived from the env
 * password so the proxy — which only sees disk + env — agrees.
 */
export function resolveSessionSecret(): string | null {
  const auth = (store.secrets.auth ??= {});
  if (auth.sessionSecret) return auth.sessionSecret;
  if (store.persistEnabled()) {
    auth.sessionSecret = randomBytes(32).toString("hex");
    store.saveSecrets();
    return auth.sessionSecret;
  }
  const env = envPassword();
  return env ? deriveSessionSecret(env) : null;
}

/** Called from runtime boot so the proxy can read the secret from disk before the first login. */
export function ensureSessionSecret(): void {
  if (store.persistEnabled()) resolveSessionSecret();
}

export function setPassword(password: string | null): void {
  const auth = (store.secrets.auth ??= {});
  if (password === null) delete auth.passwordHash;
  else auth.passwordHash = hashPassword(password);
  store.saveSecrets();
}

/* ── proxy-side state (disk, no store) ── */

export interface ProxyAuthState {
  enabled: boolean;
  sessionSecret: string | null;
}

const SECRETS_FILE = join(process.cwd(), ".data", "secrets.json");

interface DiskCache {
  mtimeMs: number;
  auth: QalaaSecrets["auth"];
}

function readSecretsFromDisk(): QalaaSecrets["auth"] {
  if (!existsSync(SECRETS_FILE)) {
    G.__qalaaSecretsDisk = undefined;
    return undefined;
  }
  let mtimeMs: number;
  try {
    mtimeMs = statSync(SECRETS_FILE).mtimeMs;
  } catch {
    return undefined;
  }
  const cached = G.__qalaaSecretsDisk;
  if (cached && cached.mtimeMs === mtimeMs) return cached.auth;
  let auth: QalaaSecrets["auth"];
  try {
    auth = (JSON.parse(readFileSync(SECRETS_FILE, "utf8")) as QalaaSecrets).auth;
  } catch {
    auth = undefined;
  }
  const entry: DiskCache = { mtimeMs, auth };
  G.__qalaaSecretsDisk = entry;
  return auth;
}

export function readProxyAuthState(): ProxyAuthState {
  const disk = readSecretsFromDisk();
  const env = envPassword();
  const enabled = !!disk?.passwordHash || !!env;
  if (!enabled) return { enabled: false, sessionSecret: null };
  const sessionSecret = disk?.sessionSecret ?? (env ? deriveSessionSecret(env) : null);
  return { enabled, sessionSecret };
}

/* ── login rate limit ── */

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** True when `key` has exhausted its failures for the current window. */
  blocked(key: string, now = Date.now()): boolean {
    const e = this.hits.get(key);
    if (!e) return false;
    if (e.resetAt <= now) {
      this.hits.delete(key);
      return false;
    }
    return e.count >= this.max;
  }

  fail(key: string, now = Date.now()): void {
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    else e.count += 1;
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}

export function loginLimiter(): RateLimiter {
  return (G.__qalaaLoginLimiter ??= new RateLimiter(5, 60_000)) as RateLimiter;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
