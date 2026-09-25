import { rt, json } from "@/app/api/_lib/util";
import { isAuthenticated } from "@/app/api/_lib/auth";
import { authEnabled } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  rt();
  const enabled = authEnabled();
  return json({ enabled, authenticated: enabled && (await isAuthenticated(req)) });
}
