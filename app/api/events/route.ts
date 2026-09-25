/**
 * SSE stream (SPEC §2): `event:/id:/data:` lines, replay via ?since=,
 * heartbeat comment every 15 s. `?json=1` returns the replay as JSON for clients
 * behind proxies that buffer streams.
 */
import { rt } from "@/app/api/_lib/util";
import { bus } from "@/server/bus";
import type { QalaaEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function formatEvent(ev: QalaaEvent): string {
  return `event: ${ev.type}\nid: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`;
}

export async function GET(req: Request) {
  rt();
  const params = new URL(req.url).searchParams;
  const since = params.get("since") ?? undefined;
  if (params.get("json")) {
    return Response.json(
      { events: bus.replay(since) },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      send(`: connected\n\n`);
      for (const ev of bus.replay(since)) send(formatEvent(ev));
      const unsub = bus.subscribe((ev) => {
        try { send(formatEvent(ev)); } catch { /* closed */ }
      });
      const heartbeat = setInterval(() => {
        try { send(`: heartbeat ${Date.now()}\n\n`); } catch { /* closed */ }
      }, 15_000);
      heartbeat.unref?.();
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsub();
        try { controller.close(); } catch { /* noop */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
