import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";
import * as world from "@/server/world/world";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  action: z.enum(["escalate", "resolve", "mark-false-positive", "isolate", "block-source"]),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const threat = store.threat(id);
  if (!threat) return err("threat not found", 404);
  const parsed = await parseBody(req, ActionSchema);
  if ("error" in parsed) return parsed.error;
  const { action } = parsed.data;
  const now = store.now();

  switch (action) {
    case "escalate": {
      const order = ["info", "low", "medium", "high", "critical"];
      const idx = order.indexOf(threat.severity);
      threat.severity = (order[Math.min(order.length - 1, idx + 1)] ?? "high") as typeof threat.severity;
      threat.status = "escalated";
      break;
    }
    case "resolve":
      threat.status = "neutralized";
      threat.resolvedAt = now;
      break;
    case "mark-false-positive":
      threat.status = "false-positive";
      threat.resolvedAt = now;
      break;
    case "isolate": {
      const sid = threat.targetServerIds[0];
      if (!sid) return err("threat has no target server");
      world.isolateHost(sid);
      threat.status = "contained";
      break;
    }
    case "block-source": {
      const ip = threat.source.ip;
      if (!ip) return err("threat has no source ip");
      world.blockEgress("", undefined, ip);
      threat.status = "contained";
      break;
    }
  }
  threat.updatedAt = now;
  store.markDirty();
  bus.emit("threat.updated", { threat }, { severity: threat.severity, summary: `${threat.id} ${action} → ${threat.status}`, href: `/threats/${threat.id}` });
  return json({ threat });
}
