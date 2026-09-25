import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { resetAuthority } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ fromOnboarding: z.boolean().optional() }).default({});

/** Back to a clean slate. `fromOnboarding: true` also takes the demo system out from under its owner so the story starts with onboarding it. */
export async function POST(req: Request) {
  rt();
  // no/empty body means a plain reset
  const parsed = await parseBody(req, BodySchema);
  const opts = "error" in parsed ? {} : parsed.data;
  return json(resetAuthority(new Date(store.s.simNowMs).toISOString(), opts));
}
