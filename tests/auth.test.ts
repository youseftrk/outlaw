import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { signSession, verifySession, shouldRenew, SESSION_TTL_MS, SESSION_COOKIE } from "@/lib/auth/session";
import { decide, isPublicPath, safeNext } from "@/lib/auth/gate";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { hashPassword, verifyPassword, authEnabled, RateLimiter, loginLimiter, ENV_PASSWORD, readProxyAuthState } from "@/server/auth";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { PATCH as patchAuth } from "@/app/api/settings/auth/route";

const SECRET = "test-secret-0123456789abcdef";

describe("session cookie (Web Crypto)", () => {
  it("signs and verifies a round-trip", async () => {
    const now = 1_700_000_000_000;
    const tok = await signSession(SECRET, now);
    const s = await verifySession(SECRET, tok, now + 1000);
    expect(s).toEqual({ iat: now, exp: now + SESSION_TTL_MS });
  });

  it("rejects tampered payload, tampered signature, wrong secret, garbage", async () => {
    const tok = await signSession(SECRET);
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ iat: 0, exp: Date.now() + 1e9 })).toString("base64url");
    expect(await verifySession(SECRET, `${forged}.${sig}`)).toBeNull();
    expect(await verifySession(SECRET, `${body}.${sig.slice(0, -1)}A`)).toBeNull();
    expect(await verifySession("other-secret", tok)).toBeNull();
    expect(await verifySession(SECRET, "not-a-token")).toBeNull();
    expect(await verifySession(SECRET, "")).toBeNull();
    expect(await verifySession(SECRET, undefined)).toBeNull();
  });

  it("expires after 12h and flags renewal in the second half", async () => {
    const now = 1_700_000_000_000;
    const tok = await signSession(SECRET, now);
    expect(await verifySession(SECRET, tok, now + SESSION_TTL_MS - 1)).not.toBeNull();
    expect(await verifySession(SECRET, tok, now + SESSION_TTL_MS)).toBeNull();
    const s = (await verifySession(SECRET, tok, now))!;
    expect(shouldRenew(s, now + 1000)).toBe(false);
    expect(shouldRenew(s, now + SESSION_TTL_MS / 2 + 1000)).toBe(true);
  });
});

describe("gate decide()", () => {
  const allowList = ["/login", "/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/_next/static/x.js", "/brand/wordmark.png", "/icon.svg"];

  it("auth disabled → everything allowed, /login bounces home", () => {
    expect(decide({ pathname: "/", enabled: false, authenticated: false })).toEqual({ kind: "allow" });
    expect(decide({ pathname: "/api/threats", enabled: false, authenticated: false })).toEqual({ kind: "allow" });
    expect(decide({ pathname: "/login", enabled: false, authenticated: false })).toEqual({ kind: "redirect", to: "/" });
  });

  it.each(allowList)("allow-list path %s is public when unauthenticated", (p) => {
    if (p !== "/login") expect(isPublicPath(p)).toBe(true);
    expect(decide({ pathname: p, enabled: true, authenticated: false }).kind).toBe("allow");
  });

  it("unauthenticated API → 401, pages → redirect with next", () => {
    expect(decide({ pathname: "/api/events", enabled: true, authenticated: false })).toEqual({ kind: "unauthorized" });
    expect(decide({ pathname: "/api/threats", enabled: true, authenticated: false })).toEqual({ kind: "unauthorized" });
    expect(decide({ pathname: "/", enabled: true, authenticated: false })).toEqual({ kind: "redirect", to: "/login" });
    expect(decide({ pathname: "/threats", enabled: true, authenticated: false })).toEqual({ kind: "redirect", to: "/login?next=%2Fthreats" });
  });

  it("authenticated → allowed; /login redirects home", () => {
    expect(decide({ pathname: "/api/events", enabled: true, authenticated: true })).toEqual({ kind: "allow" });
    expect(decide({ pathname: "/threats", enabled: true, authenticated: true })).toEqual({ kind: "allow" });
    expect(decide({ pathname: "/login", enabled: true, authenticated: true })).toEqual({ kind: "redirect", to: "/" });
  });

  it("safeNext only honours same-origin paths", () => {
    expect(safeNext("/threats")).toBe("/threats");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("password hashing", () => {
  it("scrypt hash verifies, rejects wrong password and malformed hashes", () => {
    const h = hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", "bcrypt$aa$bb")).toBe(false);
    expect(verifyPassword("x", undefined)).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks after 5 failures within the window and resets after it", () => {
    const rl = new RateLimiter(5, 60_000);
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rl.blocked("ip", t)).toBe(false);
      rl.fail("ip", t);
    }
    expect(rl.blocked("ip", t + 1)).toBe(true);
    expect(rl.blocked("other", t + 1)).toBe(false);
    expect(rl.blocked("ip", t + 60_001)).toBe(false);
  });
});

describe("auth routes", () => {
  const envBefore = process.env[ENV_PASSWORD];
  beforeAll(() => getRuntime());
  beforeEach(() => {
    delete process.env[ENV_PASSWORD];
    store.secrets.auth = { sessionSecret: SECRET };
    loginLimiter().clear("203.0.113.9");
  });
  afterAll(() => {
    if (envBefore === undefined) delete process.env[ENV_PASSWORD];
    else process.env[ENV_PASSWORD] = envBefore;
    delete store.secrets.auth;
  });

  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("disabled by default: me → { enabled:false }, login → 400", async () => {
    expect(authEnabled()).toBe(false);
    expect(await (await me(new Request("http://localhost/api/auth/me"))).json()).toEqual({ enabled: false, authenticated: false });
    expect((await login(post("/api/auth/login", { password: "x" }))).status).toBe(400);
  });

  it("env password: wrong → 401, right → sets qalaa_session; me sees it; logout clears", async () => {
    process.env[ENV_PASSWORD] = "test1234";
    expect(authEnabled()).toBe(true);

    const bad = await login(post("/api/auth/login", { password: "nope" }));
    expect(bad.status).toBe(401);

    const ok = await login(post("/api/auth/login", { password: "test1234" }));
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`));
    const token = cookie.split(";")[0].split("=")[1];
    expect(await verifySession(SECRET, token)).not.toBeNull();

    const meRes = await me(new Request("http://localhost/api/auth/me", { headers: { cookie: `${SESSION_COOKIE}=${token}` } }));
    expect(await meRes.json()).toEqual({ enabled: true, authenticated: true });
    const meAnon = await me(new Request("http://localhost/api/auth/me"));
    expect(await meAnon.json()).toEqual({ enabled: true, authenticated: false });

    const out = await logout(post("/api/auth/logout"));
    expect(out.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  });

  it("rate-limits after 5 wrong passwords per IP", async () => {
    process.env[ENV_PASSWORD] = "test1234";
    for (let i = 0; i < 5; i++) expect((await login(post("/api/auth/login", { password: "nope" }))).status).toBe(401);
    expect((await login(post("/api/auth/login", { password: "nope" }))).status).toBe(429);
    // the right password is also refused while blocked
    expect((await login(post("/api/auth/login", { password: "test1234" }))).status).toBe(429);
    // a different IP is unaffected
    expect((await login(post("/api/auth/login", { password: "test1234" }, { "x-forwarded-for": "198.51.100.1" }))).status).toBe(200);
  });

  it("settings password: PATCH sets, requires auth once enabled, null clears", async () => {
    // persistence is disabled under vitest → route refuses to set a password
    const refused = await patchAuth(new Request("http://localhost/api/settings/auth", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "longenough" }) }));
    expect(refused.status).toBe(409);

    store.secrets.auth = { sessionSecret: SECRET, passwordHash: hashPassword("longenough") };
    expect(authEnabled()).toBe(true);
    const anon = await patchAuth(new Request("http://localhost/api/settings/auth", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: null }) }));
    expect(anon.status).toBe(401);

    const ok = await login(post("/api/auth/login", { password: "longenough" }));
    const token = ok.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    const cleared = await patchAuth(
      new Request("http://localhost/api/settings/auth", { method: "PATCH", headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` }, body: JSON.stringify({ password: null }) }),
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ auth: { enabled: false, source: "off" } });
    expect(authEnabled()).toBe(false);
  });

  it("proxy state derives its secret from the env password when nothing is on disk", () => {
    process.env[ENV_PASSWORD] = "test1234";
    const st = readProxyAuthState();
    expect(st.enabled).toBe(true);
    expect(st.sessionSecret).toBeTruthy();
    delete process.env[ENV_PASSWORD];
    expect(readProxyAuthState().enabled).toBe(false);
  });
});
