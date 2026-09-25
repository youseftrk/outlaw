import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { sessionSetCookie } from "@/app/api/_lib/auth";
import { authEnabled, checkPassword, clientIp, loginLimiter } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  rt();
  if (!authEnabled()) return err("authentication is not enabled", 400);
  const parsed = await parseBody(req, Body);
  if ("error" in parsed) return parsed.error;

  const ip = clientIp(req);
  const limiter = loginLimiter();
  if (limiter.blocked(ip)) return err("too many attempts — try again in a minute", 429);

  if (!checkPassword(parsed.data.password)) {
    limiter.fail(ip);
    return err("wrong password", 401);
  }
  limiter.clear(ip);

  const cookie = await sessionSetCookie(req);
  if (!cookie) return err("session secret unavailable", 500);
  return json({ ok: true }, { headers: { "set-cookie": cookie } });
}
