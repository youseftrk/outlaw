import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = rt();
  return json({
    ok: true,
    bootedAt: r.bootedAt,
    tick: store.s.tick,
    simTime: store.now(),
    servers: store.s.servers.length,
    agents: store.s.agents.length,
    threats: store.s.threats.length,
    telemetry: store.s.telemetry.length,
    sseClients: bus.clientCount(),
    uptimeSec: Math.round(process.uptime()),
  });
}
