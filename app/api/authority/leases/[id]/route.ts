import { rt, json, err } from "@/app/api/_lib/util";
import { lease } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const l = lease(id);
  if (!l) return err("lease not found", 404);
  return json(l);
}
