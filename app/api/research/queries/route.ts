import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  return json({ queries: [...store.s.research].sort((a, b) => b.askedAt.localeCompare(a.askedAt)) });
}
