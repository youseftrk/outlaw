import { rt, json, err } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { migrationAction } from "@/server/fleet/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; action: string }> };

export async function POST(_req: Request, { params }: Params) {
  rt();
  const { id, action } = await params;
  const mig = store.migration(id);
  if (!mig) return err("migration not found", 404);
  if (!["approve", "dry-run", "execute", "rollback"].includes(action)) {
    return err(`unknown action ${action}`);
  }
  const res = migrationAction(mig, action as "approve" | "dry-run" | "execute" | "rollback");
  if (!res.ok) return err(res.error ?? "action failed");
  return json({ migration: mig });
}
