import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { sshAdapter } from "@/server/fleet/adapters";
import { syncSshSettings } from "@/server/fleet/adapters/ssh-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ serverId: z.string().min(1) });

/** Runs `echo qalaa-ok` over ssh against the chosen server and records `settings.ssh.lastTest`. */
export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, Body);
  if ("error" in parsed) return parsed.error;
  const { serverId } = parsed.data;
  if (!store.server(serverId)) return err("server not found", 404);

  const t0 = Date.now();
  const r = await sshAdapter().exec(serverId, "echo qalaa-ok");
  const stdout = typeof r.evidence?.stdout === "string" ? r.evidence.stdout.trim() : "";
  const ok = r.ok && stdout === "qalaa-ok";
  const result = {
    ok,
    at: new Date().toISOString(),
    serverId,
    latencyMs: Date.now() - t0,
    sample: stdout || undefined,
    error: ok ? undefined : r.summary,
  };
  const ssh = syncSshSettings();
  ssh.lastTest = result;
  store.markDirty();
  return json({ ...result, command: r.command }, { status: ok ? 200 : 502 });
}
