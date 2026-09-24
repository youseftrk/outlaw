import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { aggregateInsights } from "@/server/insights/aggregate";
import type { InsightsWindow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  rt();
  const window = (new URL(req.url).searchParams.get("window") ?? "24h") as InsightsWindow;
  const w: InsightsWindow = ["24h", "7d", "30d"].includes(window) ? window : "24h";
  return json(aggregateInsights(store.s, w, store.s.simNowMs));
}
