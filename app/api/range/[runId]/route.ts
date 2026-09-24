import { rt, json, err } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { listScenarios } from "@/server/range/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

export async function GET(_req: Request, { params }: Params) {
  rt();
  const { runId } = await params;
  const run = store.s.rangeRuns.find((r) => r.id === runId);
  if (!run) return err("run not found", 404);
  const scenario = listScenarios().find((s) => s.id === run.scenarioId);
  const threats = store.s.threats.filter((t) => t.rangeRunId === run.id);
  return json({ run, scenario, threats });
}
