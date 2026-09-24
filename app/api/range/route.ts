import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { listScenarios } from "@/server/range/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  const s = store.s;
  return json({
    scenarios: listScenarios(),
    activeRun: s.rangeRuns.find((r) => r.id === s.activeRunId) ?? null,
    runs: [...s.rangeRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20),
  });
}
