import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const TapSchema = z.object({
  tapback: z.enum(["heart", "thumbs-up", "thumbs-down", "haha", "!!", "?"]).nullable(),
});

export async function POST(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const msg = store.s.messages.find((m) => m.id === id);
  if (!msg) return err("message not found", 404);
  const parsed = await parseBody(req, TapSchema);
  if ("error" in parsed) return parsed.error;
  msg.tapback = parsed.data.tapback ?? undefined;
  store.markDirty();
  bus.emit("message.updated", { message: msg }, { summary: `tapback ${msg.tapback ?? "removed"} on ${id}`, href: "/messages" });
  return json({ message: msg });
}
