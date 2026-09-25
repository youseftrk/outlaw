import { rt, json, err } from "@/app/api/_lib/util";
import { pathFor } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  rt();
  const leaseId = new URL(req.url).searchParams.get("leaseId");
  if (!leaseId) return err("leaseId required", 400);
  const path = pathFor(leaseId);
  if (!path) return err("lease not found", 404);
  return json(path);
}
