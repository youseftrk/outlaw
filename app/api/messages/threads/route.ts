import { rt, json } from "@/app/api/_lib/util";
import { listThreads } from "@/server/messaging/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  return json({ threads: listThreads() });
}
