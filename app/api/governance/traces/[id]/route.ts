import { rt, json, err } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const trace = store.trace(id);
  if (!trace) return err("trace not found", 404);
  return json({ trace });
}
