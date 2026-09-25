import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { resetAuthority } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  rt();
  return json(resetAuthority(new Date(store.s.simNowMs).toISOString()));
}
