import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  return json({ agents: store.s.agents });
}
