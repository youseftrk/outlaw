import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { threadMessages } from "@/server/messaging/threads";
import { handleOperatorMessage } from "@/server/messaging/commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const thread = store.thread(id);
  if (!thread) return err("thread not found", 404);
  const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") ?? 100));
  return json({ thread, messages: threadMessages(id, limit) });
}

const SendSchema = z.object({ text: z.string().min(1) });

export async function POST(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  if (!store.thread(id)) return err("thread not found", 404);
  const parsed = await parseBody(req, SendSchema);
  if ("error" in parsed) return parsed.error;
  const result = await handleOperatorMessage(id, parsed.data.text);
  return json(result);
}
