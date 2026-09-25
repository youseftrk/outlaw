import { json } from "@/app/api/_lib/util";
import { sessionClearCookie } from "@/app/api/_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return json({ ok: true }, { headers: { "set-cookie": sessionClearCookie(req) } });
}
