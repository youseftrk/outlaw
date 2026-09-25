import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { isAuthenticated, sessionSetCookie } from "@/app/api/_lib/auth";
import { authEnabled, authSource, setPassword } from "@/server/auth";
import { store } from "@/server/store";
import { bus } from "@/server/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ password: z.string().min(8, "at least 8 characters").nullable() });

/** Set (string) or clear (null) the operator password. Needs a valid session while auth is on. */
export async function PATCH(req: Request) {
  rt();
  if (authEnabled() && !(await isAuthenticated(req))) return err("unauthorized", 401);
  const parsed = await parseBody(req, Body);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.password !== null && !store.persistEnabled()) {
    return err("persistence is disabled — set QALAA_AUTH_PASSWORD instead", 409);
  }

  setPassword(parsed.data.password);
  const enabled = authEnabled();
  bus.emit("system", { auth: { enabled } }, { summary: enabled ? "access password updated" : "access password cleared", href: "/settings" });

  const headers = new Headers();
  if (enabled) {
    const cookie = await sessionSetCookie(req);
    if (cookie) headers.set("set-cookie", cookie);
  }
  return json({ auth: { enabled, source: authSource() } }, { headers });
}
