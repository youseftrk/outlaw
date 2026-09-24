import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  rt();
  const status = new URL(req.url).searchParams.get("status");
  let approvals = [...store.s.approvals].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  if (status) approvals = approvals.filter((a) => a.status === status);
  return json({ approvals });
}
