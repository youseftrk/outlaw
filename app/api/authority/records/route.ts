import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  rt();
  const q = new URL(req.url).searchParams;
  let records = store.s.records;
  const leaseId = q.get("leaseId");
  const kind = q.get("kind");
  if (leaseId) records = records.filter((r) => r.leaseId === leaseId);
  if (kind) records = records.filter((r) => r.kind === kind);
  const limit = Math.min(500, Number(q.get("limit") ?? 200));
  return json(records.slice(-limit));
}
