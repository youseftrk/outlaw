import { rt, json, err } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { markRead } from "@/server/messaging/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  if (!store.thread(id)) return err("thread not found", 404);
  const read = markRead(id);
  return json({ ok: true, read });
}
