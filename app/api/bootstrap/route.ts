import type { Bootstrap } from "@/lib/types";
import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { listScenarios } from "@/server/range/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  const s = store.s;
  const body: Bootstrap = {
    agents: s.agents,
    servers: s.servers,
    threats: s.threats,
    approvals: s.approvals,
    threads: s.threads,
    policies: s.policies,
    migrations: s.migrations,
    settings: s.settings,
    range: {
      scenarios: listScenarios(),
      activeRun: s.rangeRuns.find((r) => r.id === s.activeRunId) ?? null,
    },
    entities: s.entities,
    leases: s.leases,
    serverTime: store.now(),
  };
  return json(body);
}
