import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  rt();
  const q = new URL(req.url).searchParams;
  let records = store.s.records;
  const leaseId = q.get("leaseId");
  const system = q.get("system");
  const kind = q.get("kind");
  if (leaseId) records = records.filter((r) => r.leaseId === leaseId);
  if (system) {
    const srv = store.server(system);
    const names = new Set([system, srv?.hostname].filter(Boolean) as string[]);
    const leaseIds = new Set(store.s.leases.filter((l) => l.scope.serverIds?.includes(system)).map((l) => l.id));
    records = records.filter((r) => {
      if (r.leaseId && leaseIds.has(r.leaseId)) return true;
      const target = r.target;
      return Boolean(target) && [...names].some((n) => target!.includes(n));
    });
  }
  if (kind) records = records.filter((r) => r.kind === kind);
  const limit = Math.min(500, Number(q.get("limit") ?? 200));
  return json(records.slice(-limit));
}
