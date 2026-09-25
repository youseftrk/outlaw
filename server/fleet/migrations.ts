/**
 * Migration state machine (SPEC §6.2):
 * planned → awaiting-approval → dry-run → executing → verifying →
 * completed | rolled-back | failed. Owner Rahhal; each transition is a
 * trace span; progress emitted every tick while executing (~30 s at 1×).
 * incident-response migrations move workloads off compromised servers and
 * rebuild the source instead of decommissioning it.
 */
import type { Migration, MigrationStep, MigrationStatus, MigrationReason, Provider, Region, ServerRole, ID } from "@/lib/types";
import { bus } from "../bus";
import { ids } from "../ids";
import { store } from "../store";
import * as world from "../world/world";

const STEP_NAMES = ["snapshot", "provision target", "sync data", "cut traffic", "verify health", "decommission source"];

export function createMigration(opts: {
  sourceServerId: ID;
  targetServerId?: ID;
  targetSpec?: { provider?: Provider; region?: Region | string; role?: ServerRole };
  reason: MigrationReason;
  workloads?: string[];
  ownerAgentId?: ID;
}): Migration {
  const src = store.server(opts.sourceServerId);
  const incident = opts.reason === "incident-response";
  const steps: MigrationStep[] = STEP_NAMES.map((name, i) => ({
    id: `MS-${store.s.migrations.length}-${i}`,
    name,
    status: "pending",
    log: [],
  }));
  if (incident) steps[5].status = "skipped"; // source rebuilt instead
  const mig: Migration = {
    id: ids.migration(),
    title: `${incident ? "Evacuate" : "Move"} ${src?.hostname ?? opts.sourceServerId}${opts.targetSpec?.region ? ` → ${opts.targetSpec.region}` : ""}`,
    reason: opts.reason,
    sourceServerId: opts.sourceServerId,
    targetServerId: opts.targetServerId,
    targetSpec: opts.targetSpec as Migration["targetSpec"],
    workloads: opts.workloads ?? src?.workloads ?? [],
    status: "planned",
    steps,
    ownerAgentId: opts.ownerAgentId ?? "agt-rahhal",
    traceIds: [],
    progress: 0,
    createdAt: store.now(),
    updatedAt: store.now(),
  };
  store.s.migrations.push(mig);
  store.markDirty();
  bus.emit("migration.updated", { migration: mig }, { summary: `migration ${mig.id} created — ${mig.title}`, href: "/fleet" });
  return mig;
}

export function migrationAction(mig: Migration, action: "approve" | "dry-run" | "execute" | "rollback"): { ok: boolean; error?: string } {
  const now = store.now();
  const set = (status: MigrationStatus) => {
    mig.status = status;
    mig.updatedAt = now;
    store.markDirty();
    bus.emit("migration.updated", { migration: mig }, { summary: `${mig.id} → ${status}`, href: "/fleet" });
  };
  switch (action) {
    case "approve":
      if (mig.status !== "awaiting-approval") return { ok: false, error: "not awaiting approval" };
      set("planned");
      return { ok: true };
    case "dry-run":
      if (mig.status !== "planned") return { ok: false, error: "not in planned state" };
      set("dry-run");
      mig.steps[0].status = "running";
      return { ok: true };
    case "execute":
      if (!["planned", "dry-run"].includes(mig.status)) return { ok: false, error: "cannot execute from current state" };
      set("executing");
      const src = store.server(mig.sourceServerId);
      if (src) src.status = "migrating";
      return { ok: true };
    case "rollback":
      if (!["executing", "verifying", "dry-run"].includes(mig.status)) return { ok: false, error: "nothing to roll back" };
      set("rolled-back");
      const s2 = store.server(mig.sourceServerId);
      if (s2 && s2.status === "migrating") s2.status = "healthy";
      return { ok: true };
    default:
      return { ok: false, error: `unknown action ${action}` };
  }
}

/** Per-tick progress — executing migrations advance ~30 s total at 1×. */
export function tickMigrations(): void {
  for (const mig of store.s.migrations) {
    if (mig.status === "dry-run") {
      mig.steps[0].status = "done";
      mig.steps[0].finishedAt = store.now();
      mig.steps[0].log.push("dry-run passed");
      mig.status = "planned";
      mig.progress = 15;
      mig.updatedAt = store.now();
      bus.emit("migration.updated", { migration: mig }, { summary: `${mig.id} dry-run clean`, href: "/fleet" });
      continue;
    }
    if (mig.status !== "executing" && mig.status !== "verifying") continue;
    mig.progress = Math.min(99, mig.progress + 4);
    mig.updatedAt = store.now();
    // stepper: advance a step every ~5 progress points
    const stepIdx = Math.min(mig.steps.length - 1, Math.floor(mig.progress / 18));
    mig.steps.forEach((s, i) => {
      if (i < stepIdx && s.status === "running" || (i < stepIdx && s.status === "pending")) {
        s.status = "done";
        s.finishedAt = store.now();
        s.log.push(`${s.name} done`);
      } else if (i === stepIdx && s.status === "pending") {
        s.status = "running";
        s.startedAt = store.now();
      }
    });
    if (mig.progress >= 20 && mig.status === "executing") mig.status = "verifying";
    if (mig.progress >= 99) {
      mig.status = "completed";
      mig.progress = 100;
      mig.steps.forEach((s) => { if (s.status !== "skipped") { s.status = "done"; s.finishedAt = store.now(); } });
      const src = store.server(mig.sourceServerId);
      const dst = mig.targetServerId ? store.server(mig.targetServerId) : undefined;
      if (src) {
        if (mig.reason === "incident-response") {
          world.rebuildNode(src.id, { agentId: mig.ownerAgentId, toolName: "rebuild_node" });
          src.status = "healthy";
        } else {
          src.status = "offline";
          src.workloads = [];
        }
        if (dst) {
          dst.workloads = [...new Set([...dst.workloads, ...mig.workloads])];
          dst.status = "healthy";
        }
      }
      bus.emit("migration.updated", { migration: mig }, { summary: `${mig.id} completed`, href: "/fleet" });
    } else {
      bus.emit("migration.updated", { migration: mig }, { summary: `${mig.id} ${mig.progress}%`, href: "/fleet" });
    }
    store.markDirty();
  }
}

/** Rahhal watches for compromised servers → incident-response migration. */
const queued = new Set<ID>();
export function checkIncidentMigrations(): void {
  for (const srv of store.s.servers) {
    if (srv.status !== "compromised" || queued.has(srv.id)) continue;
    if (store.s.migrations.some((m) => m.sourceServerId === srv.id && !["completed", "failed", "rolled-back"].includes(m.status))) continue;
    // pick a healthy same-region target
    const target = store.s.servers.find((s) => s.region === srv.region && s.env === srv.env && s.status === "healthy" && s.id !== srv.id && ["k8s-node", "worker", "api"].includes(s.role));
    const mig = createMigration({
      sourceServerId: srv.id,
      targetServerId: target?.id,
      reason: "incident-response",
      workloads: srv.workloads,
      ownerAgentId: "agt-rahhal",
    });
    queued.add(srv.id);
    // governed: database-role sources need approval (pol-01)
    if (srv.role === "database") {
      mig.status = "awaiting-approval";
    } else {
      mig.status = "executing";
      srv.status = "migrating";
    }
    store.markDirty();
    bus.emit("migration.updated", { migration: mig }, { summary: `incident-response migration ${mig.id} for ${srv.hostname}`, href: "/fleet" });
  }
}
