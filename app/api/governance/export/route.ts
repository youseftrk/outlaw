import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Governance export bundle (SPEC §5). */
export async function GET() {
  rt();
  const s = store.s;
  return json({
    exportedAt: store.now(),
    policies: s.policies,
    traces: s.traces,
    approvals: s.approvals,
    agents: s.agents.map((a) => ({ id: a.id, name: a.name, autonomy: a.autonomy, metrics: a.metrics })),
    events: s.events.slice(-500),
  });
}
