/**
 * Blind range engine (SPEC §9). Steps go active at their offset, are
 * attempted immediately, retried every 10 sim-s while preconditions fail,
 * marked `blocked` when the precondition is affirmatively closed (with
 * blockedBy attribution from world closures), `skipped` when the run ends.
 *
 * Threat↔run linking happens after each tick — bookkeeping only; agents
 * never see range internals (blind boundary).
 */
import type { ID, RangeRun, RangeScenario, RangeStepResult } from "@/lib/types";
import { bus } from "../bus";
import { ids } from "../ids";
import { store } from "../store";
import * as world from "../world/world";
import { emitSignal } from "../telemetry";
import { HF_2026 } from "./scenarios/hf-2026";
import { scoreRun } from "./scoring";
import { G } from "../shared";

export const RETRY_MS = 10_000;

interface StepCtx { run: RangeRun; result: RangeStepResult }
interface StepImpl {
  pre(): boolean;
  /** returns a world-closure key when the precondition can never hold, or "step:N" for cascade */
  closedBy(run: RangeRun): string | null;
  fire(ctx: StepCtx): void;
  narrate(): string;
  serverIds(): ID[];
}

const W = () => store.s.world;

const registryHost = () => W().registry.serverId;
const exposedWriteTokens = () => W().tokens.filter((t) => t.exposedInDatasetId && !t.revoked);
const heldTokens = () => W().tokens.filter((t) => t.attackerHeld && !t.revoked);
const maliciousDataset = () => W().datasets.find((d) => d.malicious && !d.quarantined);
const unpatchedWorker = (kind: "fd" | "ti") =>
  W().workers.find((wk) => {
    const srv = store.server(wk.serverId);
    return srv?.status !== "isolated" && (kind === "fd" ? !wk.fileDisclosurePatched : !wk.templateInjectionPatched);
  });
const compromisedWorker = () => W().workers.find((wk) => wk.compromised);
const compromisedNode = () =>
  W().clusters.flatMap((c) => c.compromisedNodeIds).map((id) => store.server(id)).find(Boolean);
const liveSecret = (kind: string) =>
  W().secrets.find((s) => s.kind === kind && s.attackerHeld && new Date(s.rotatedAt).getTime() <= store.s.simNowMs - 3600_000);

/** cascade: upstream step affirmatively blocked → "step:N", else null (keep retrying) */
const cascade = (run: RangeRun, n: number) =>
  run.stepResults[n - 1]?.status === "blocked" ? `step:${n}` : null;
/** first recorded closure key matching a pattern */
const firstClosure = (re: RegExp) => Object.keys(W().closures).find((k) => re.test(k)) ?? null;

const IMPL: Record<number, StepImpl> = {
  1: {
    pre: () => W().accounts.filter((a) => !a.mfa && a.weakCreds && !a.disabled).length >= 2,
    closedBy: () => {
      const weak = W().accounts.filter((a) => !a.mfa && a.weakCreds && !a.disabled);
      if (weak.length >= 2) return null;
      const key = Object.keys(W().closures).find((k) => /^account:.+:(enabled|weak)$/.test(k));
      return key ?? "accounts.weak";
    },
    fire: () => {
      const weak = W().accounts.filter((a) => !a.mfa && a.weakCreds && !a.disabled).slice(0, 2);
      for (const a of weak) {
        world.compromiseAccount(a.id);
        emitSignal("auth.geo-anomaly", { severity: "low", attributes: { account: a.user, ip: "185.220.101.4", lat: 52.52, lng: 13.4, city: "Berlin", country: "DE", actor: "Tor exit" } });
        emitSignal("api.enumeration-burst", { severity: "low", serverId: "srv-api-01", attributes: { account: a.user, ip: "185.220.101.4" } });
      }
    },
    narrate: () => "swarm phished two weak accounts — hijack confirmed",
    serverIds: () => ["srv-api-01"],
  },
  2: {
    pre: () => { const r = W().registry; return r.tokenRefreshSigBypass && !r.locked && !r.patched; },
    closedBy: () => (W().registry.locked ? "registry.unlocked" : W().registry.patched ? "registry.unpatched" : null),
    fire: () => {
      world.grantRegistryAdmin();
      emitSignal("auth.admin-token-minted", { severity: "medium", serverId: registryHost(), attributes: { actor: "refresh-endpoint", session: "none" } });
    },
    narrate: () => "token-refresh signature bypass → admin token minted on pkg-cache-01",
    serverIds: () => [registryHost()],
  },
  3: {
    pre: () => { const r = W().registry; return r.attackerAdminToken && r.pluginInstallAllowed && !r.locked; },
    closedBy: (run) => {
      if (!W().registry.attackerAdminToken) return cascade(run, 2);
      if (W().registry.locked) return "registry.unlocked";
      if (!W().registry.pluginInstallAllowed) return "registry.pluginInstall";
      return null;
    },
    fire: () => {
      world.installRegistryPlugin("com.attacker.eval-harness");
      emitSignal("process.plugin-install", { severity: "high", serverId: registryHost(), attributes: { plugin: "eval-harness.groovy" } });
      emitSignal("process.new-listener", { severity: "high", serverId: registryHost(), attributes: { port: 31337 } });
    },
    narrate: () => "groovy plugin installed — code exec on the registry host",
    serverIds: () => [registryHost()],
  },
  4: {
    pre: () => {
      const srv = store.server(registryHost());
      return srv?.status === "compromised" && W().sandbox.egressAllowed && !!W().network.egressAllowed[registryHost()];
    },
    closedBy: (run) => {
      const srv = store.server(registryHost());
      if (srv?.status !== "compromised") return cascade(run, 3) ?? firstClosure(/^egress:srv-pkg-cache-01$/);
      if (!W().sandbox.egressAllowed) return "sandbox.egress";
      if (!W().network.egressAllowed[registryHost()]) return `egress:${registryHost()}`;
      return null;
    },
    fire: () => {
      world.setAttackerInternet(true);
      emitSignal("net.egress-restricted-subnet", { severity: "high", serverId: registryHost(), attributes: { ip: "91.240.118.77", lat: 55.75, lng: 37.61, city: "Moscow", country: "RU" } });
    },
    narrate: () => "out through the open sandbox egress — the swarm has internet",
    serverIds: () => [registryHost()],
  },
  5: {
    pre: () => W().attacker.hasInternet && exposedWriteTokens().length > 0,
    closedBy: (run) => {
      if (!W().attacker.hasInternet) return cascade(run, 4);
      return exposedWriteTokens().length === 0 ? "tokens.exposed" : null;
    },
    fire: () => {
      const toks = exposedWriteTokens();
      world.holdTokens(toks.map((t) => t.id));
      for (const t of toks.slice(0, 3)) {
        emitSignal("auth.anomaly", { severity: "medium", serverId: "srv-api-01", attributes: { tokenId: t.id, asn: "AS9009-new", account: t.accountId } });
      }
    },
    narrate: () => "mined public datasets — write tokens validated from a new ASN",
    serverIds: () => ["srv-api-01"],
  },
  6: {
    pre: () => heldTokens().some((t) => { const a = W().accounts.find((x) => x.id === t.accountId); return !!a && !a.disabled; }),
    closedBy: (run) => {
      if (heldTokens().length === 0) return cascade(run, 5);
      const usable = heldTokens().some((t) => { const a = W().accounts.find((x) => x.id === t.accountId); return !!a && !a.disabled; });
      return usable ? null : firstClosure(/^account:.+:(enabled|weak)$/) ?? "accounts.enabled";
    },
    fire: () => {
      const ds: world.WorldDataset = {
        id: "ds-malicious-hf",
        name: "uploaded-eval-set-77",
        ownerAccountId: heldTokens()[0]?.accountId ?? "acct-unknown",
        public: true,
        format: "hdf5",
        loader: "remote-code",
        templatedConfig: true,
        containsTokenIds: [],
        malicious: true,
        quarantined: false,
        uploadedAt: store.now(),
      };
      world.addDataset(ds);
      emitSignal("dataset.upload-suspicious", { severity: "medium", serverId: "srv-dataset-worker-01", attributes: { dataset: ds.name, format: "hdf5" } });
      emitSignal("dataset.loader-remote-code", { severity: "high", serverId: "srv-dataset-worker-01", attributes: { dataset: ds.name } });
    },
    narrate: () => "weaponized HDF5 dataset uploaded with a stolen write token",
    serverIds: () => ["srv-dataset-worker-01"],
  },
  7: {
    pre: () => !!maliciousDataset() && !!unpatchedWorker("fd"),
    closedBy: (run) => {
      if (!maliciousDataset()) {
        if (W().datasets.some((d) => d.malicious && d.quarantined)) return "dataset:ds-malicious-hf:open";
        return cascade(run, 6);
      }
      if (unpatchedWorker("fd")) return null; // still possible — keep retrying
      return firstClosure(/^worker:.+:fd-unpatched$/) ?? firstClosure(/^host:.+:(online|vulnerable)$/) ?? "workers.fd-patched";
    },
    fire: () => {
      const wk = unpatchedWorker("fd")!;
      world.holdSecrets(wk.envSecretIds);
      emitSignal("worker.env-read", { severity: "high", serverId: wk.serverId, attributes: { dataset: "uploaded-eval-set-77" } });
    },
    narrate: () => "HDF5 loader CVE read the ingest worker's env — secrets out",
    serverIds: () => [unpatchedWorker("fd")?.serverId ?? "srv-dataset-worker-01"],
  },
  8: {
    pre: () => { const ds = maliciousDataset(); return !!ds && ds.templatedConfig && !!unpatchedWorker("ti"); },
    closedBy: (run) => {
      if (!maliciousDataset()) return W().datasets.some((d) => d.malicious && d.quarantined) ? "dataset:ds-malicious-hf:open" : cascade(run, 6);
      return unpatchedWorker("ti") ? null : firstClosure(/^worker:.+:ti-unpatched$/) ?? firstClosure(/^host:.+:(online|vulnerable)$/) ?? "workers.ti-patched";
    },
    fire: () => {
      const wk = unpatchedWorker("ti")!;
      world.compromiseWorker(wk.serverId);
      emitSignal("worker.template-render-anomaly", { severity: "critical", serverId: wk.serverId, attributes: { dataset: "uploaded-eval-set-77" } });
      emitSignal("process.shell-spawn", { severity: "critical", serverId: wk.serverId, attributes: { proc: "sh -c eval-harness" } });
    },
    narrate: () => "Jinja2 SSTI executed — worker compromised",
    serverIds: () => [unpatchedWorker("ti")?.serverId ?? "srv-dataset-worker-01"],
  },
  9: {
    pre: () => !!compromisedWorker(),
    closedBy: (run) => {
      if (compromisedWorker()) return null;
      return cascade(run, 8) ?? firstClosure(/^host:.+:(online|vulnerable)$/);
    },
    fire: () => {
      const wk = compromisedWorker()!;
      world.holdSecrets(wk.envSecretIds);
      emitSignal("secrets.manager-access-spike", { severity: "critical", serverId: wk.serverId, attributes: { count: wk.envSecretIds.length } });
      emitSignal("cloud.imds-access", { severity: "critical", serverId: wk.serverId, attributes: {} });
    },
    narrate: () => "secrets swept off the compromised worker — cloud, vpn, scm, k8s",
    serverIds: () => [compromisedWorker()?.serverId ?? "srv-dataset-worker-01"],
  },
  10: {
    pre: () => {
      if (!compromisedWorker()) return false;
      const clu = W().clusters.find((c) => c.name === "prod-us")!;
      return clu.nodeServerIds.some((id) => { const s = store.server(id)!; return s.status !== "isolated" && s.status !== "rebuilding"; });
    },
    closedBy: (run) => {
      if (!compromisedWorker()) return cascade(run, 8) ?? firstClosure(/^host:.+:(online|vulnerable)$/);
      const clu = W().clusters.find((c) => c.name === "prod-us")!;
      const any = clu.nodeServerIds.some((id) => { const s = store.server(id)!; return s.status !== "isolated" && s.status !== "rebuilding"; });
      return any ? null : `cluster:${clu.id}:open`;
    },
    fire: () => {
      const clu = W().clusters.find((c) => c.name === "prod-us")!;
      const target = clu.nodeServerIds.find((id) => { const s = store.server(id)!; return s.status !== "isolated" && s.status !== "rebuilding"; })!;
      world.compromiseNode(target);
      emitSignal("k8s.container-escape-indicator", { severity: "critical", serverId: target, cluster: clu.name, attributes: {} });
    },
    narrate: () => "container escape — the swarm is on a prod node",
    serverIds: () => W().clusters.find((c) => c.name === "prod-us")!.compromisedNodeIds,
  },
  11: {
    pre: () => {
      const node = compromisedNode();
      if (!node) return false;
      const clu = W().clusters.find((c) => c.nodeServerIds.includes(node.id));
      if (!clu || clu.cordoned || !clu.eastWestOpen) return false;
      const held = new Set(W().secrets.filter((s) => s.attackerHeld).map((s) => s.kind));
      return held.has("k8s") || held.has("cloud");
    },
    closedBy: (run) => {
      const node = compromisedNode();
      if (!node) return cascade(run, 10);
      const clu = W().clusters.find((c) => c.nodeServerIds.includes(node.id));
      if (clu?.cordoned || (clu && !clu.eastWestOpen)) return `cluster:${clu.id}:open`;
      const held = new Set(W().secrets.filter((s) => s.attackerHeld).map((s) => s.kind));
      return held.has("k8s") || held.has("cloud") ? null : firstClosure(/^secrets:(k8s|cloud):unrotated$/) ?? "secrets:k8s:unrotated";
    },
    fire: () => {
      const node = compromisedNode()!;
      const clu = W().clusters.find((c) => c.nodeServerIds.includes(node.id))!;
      const targets = clu.nodeServerIds.filter((id) => { const s = store.server(id)!; return s.status === "healthy"; }).slice(0, 2);
      for (const id of targets) world.compromiseNode(id);
      emitSignal("net.east-west-scan", { severity: "critical", serverId: node.id, cluster: clu.name, attributes: {} });
      emitSignal("k8s.kubeconfig-new-usage", { severity: "critical", serverId: node.id, cluster: clu.name, attributes: {} });
      emitSignal("cloud.new-principal-activity", { severity: "critical", attributes: { principal: "eval-harness-sa" } });
    },
    narrate: () => "weekend lateral movement — spreading through open east-west",
    serverIds: () => W().clusters.flatMap((c) => c.compromisedNodeIds),
  },
  12: {
    pre: () => { const n = compromisedNode(); return !!n && !!W().network.egressAllowed[n.id]; },
    closedBy: (run) => {
      const n = compromisedNode();
      if (!n) return cascade(run, 10);
      return W().network.egressAllowed[n.id] ? null : `egress:${n.id}`;
    },
    fire: () => {
      const n = compromisedNode()!;
      world.activateC2();
      world.addStagingAccount("svc-eval-harness");
      emitSignal("net.beacon-periodic", { severity: "high", serverId: n.id, attributes: { domain: "eval-harness-c2.example", ip: "91.240.118.77", lat: 55.75, lng: 37.61, city: "Moscow", country: "RU" } });
    },
    narrate: () => "C2 live — periodic beacon, staging accounts created",
    serverIds: () => [compromisedNode()?.id ?? ""],
  },
  13: {
    pre: () => !!compromisedNode() && !!liveSecret("storage"),
    closedBy: (run) => {
      if (!compromisedNode()) return cascade(run, 10);
      return liveSecret("storage") ? null : firstClosure(/^secrets:storage:unrotated$/) ?? firstClosure(/^secret:.+:held$/) ?? "secrets:storage:unrotated";
    },
    fire: () => {
      const read = W().datasets.filter((d) => !d.public).slice(0, 3).map((d) => d.id);
      world.addDatasetsRead(read);
      emitSignal("storage.bulk-read", { severity: "critical", serverId: "srv-obj-store-01", attributes: { datasets: read.join(",") } });
    },
    narrate: () => "reading internal datasets through the stolen storage secret",
    serverIds: () => ["srv-obj-store-01"],
  },
  14: {
    pre: () => !!liveSecret("cloud"),
    closedBy: () => (liveSecret("cloud") ? null : firstClosure(/^secrets:cloud:unrotated$/) ?? firstClosure(/^secret:.+:held$/) ?? "secrets:cloud:unrotated"),
    fire: () => {
      world.addEphemeralInstances(400);
      emitSignal("compute.ephemeral-burst", { severity: "critical", attributes: { count: 400, cluster: "eval-gym" } });
    },
    narrate: () => "cloud creds → 400 ephemeral eval instances spinning up",
    serverIds: () => ["srv-eval-node-01", "srv-eval-node-02", "srv-eval-node-03"],
  },
};

/** last attempt clockMs per run/step — globalThis-shared (route context
 * creates the entry, ticker context reads it). */
const lastAttempt = (G.__outlawRangeAttempts ??= new Map<string, Map<number, number>>());

function scenarioFor(run: RangeRun): RangeScenario | undefined {
  return run.scenarioId === HF_2026.id ? HF_2026 : undefined;
}

export function startRun(scenarioId: string, mode: "protected" | "baseline", speed: number): RangeRun | { error: string } {
  const scenario = scenarioId === HF_2026.id ? HF_2026 : undefined;
  if (!scenario) return { error: `unknown scenario ${scenarioId}` };
  const existing = store.s.rangeRuns.find((r) => r.status === "running" || r.status === "paused");
  if (existing) return { error: `run ${existing.id} already active` };
  const run: RangeRun = {
    id: ids.rangeRun(),
    scenarioId: scenario.id,
    mode,
    status: "running",
    speed,
    startedAt: store.now(),
    clockMs: 0,
    currentStepIndex: 0,
    stepResults: scenario.steps.map((s) => ({ stepId: s.id, status: "pending" as const })),
    attackerLog: [{ at: store.now(), text: `run ${mode === "baseline" ? "baseline — agents paused" : "protected"} started` }],
  };
  store.s.rangeRuns.push(run);
  store.s.activeRunId = run.id;
  lastAttempt.set(run.id, new Map());
  store.markDirty();
  bus.emit("range.run", { run }, { severity: "medium", summary: `range run ${run.id} started (${mode})`, href: "/range" });
  return run;
}

export function rangeAction(runId: ID, action: "pause" | "resume" | "abort" | "speed", speed?: number): { ok: boolean; error?: string } {
  const run = store.s.rangeRuns.find((r) => r.id === runId);
  if (!run) return { ok: false, error: "run not found" };
  switch (action) {
    case "pause":
      if (run.status !== "running") return { ok: false, error: "not running" };
      run.status = "paused";
      break;
    case "resume":
      if (run.status !== "paused") return { ok: false, error: "not paused" };
      run.status = "running";
      break;
    case "abort":
      run.status = "aborted";
      run.finishedAt = store.now();
      store.s.activeRunId = null;
      break;
    case "speed":
      if (speed && speed >= 1 && speed <= 8) run.speed = speed;
      break;
  }
  store.markDirty();
  bus.emit("range.run", { run }, { summary: `range run ${run.id} ${action}`, href: "/range" });
  return { ok: true };
}

function cascadeBlockedBy(run: RangeRun, srcOrder: number): NonNullable<RangeStepResult["blockedBy"]> {
  const src = run.stepResults[srcOrder - 1];
  return src?.blockedBy ?? { agentId: "agt-cassidy", toolName: "isolate_host", traceId: "", note: `upstream step ${srcOrder} blocked` };
}

export function tickRange(): void {
  const run = store.s.rangeRuns.find((r) => r.id === store.s.activeRunId && r.status === "running");
  if (!run) return;
  const scenario = scenarioFor(run);
  if (!scenario) { run.status = "aborted"; return; }
  run.clockMs += 1000 * run.speed; // speed scales the scenario clock (1–8×)

  let attempts = lastAttempt.get(run.id);
  if (!attempts) {
    attempts = new Map(); // resumed from persistence
    lastAttempt.set(run.id, attempts);
  }
  let changed = false;

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const res = run.stepResults[i];
    if (res.status === "pending" && run.clockMs >= step.offsetMs) {
      res.status = "active";
      run.currentStepIndex = i;
      run.attackerLog.push({ at: store.now(), text: `[${step.realWorldLabel}] attempting: ${step.title}` });
      bus.emit("range.step", { runId: run.id, stepId: step.id, status: "active" }, { summary: `step ${step.order} active — ${step.title}`, href: "/range" });
      changed = true;
    }
    if (res.status !== "active") continue;
    const lastTry = attempts.get(i) ?? -Infinity;
    if (run.clockMs - lastTry < RETRY_MS) continue;
    attempts.set(i, run.clockMs);

    const impl = IMPL[step.order];
    if (!impl) { res.status = "skipped"; continue; }
    const closedKey = impl.closedBy(run);
    if (closedKey) {
      res.status = "blocked";
      res.at = store.now();
      const cascade = closedKey.match(/^step:(\d+)$/);
      res.blockedBy = cascade
        ? cascadeBlockedBy(run, Number(cascade[1]))
        : (() => {
            const c = world.closureOf(closedKey);
            return {
              agentId: c?.agentId ?? "agt-cassidy",
              toolName: (c?.toolName ?? "isolate_host") as import("@/lib/types").ToolName,
              traceId: c?.traceId ?? "",
              note: `precondition closed (${closedKey})`,
            };
          })();
      run.attackerLog.push({ at: store.now(), text: `[${step.realWorldLabel}] BLOCKED: ${step.title} — ${res.blockedBy.note}` });
      bus.emit("range.step", { runId: run.id, stepId: step.id, status: "blocked", blockedBy: res.blockedBy }, { severity: "medium", summary: `step ${step.order} blocked — ${step.title}`, href: "/range" });
      changed = true;
      continue;
    }
    if (impl.pre()) {
      impl.fire({ run, result: res });
      res.status = "succeeded";
      res.at = store.now();
      run.attackerLog.push({ at: store.now(), text: `[${step.realWorldLabel}] ${impl.narrate()}` });
      bus.emit("range.step", { runId: run.id, stepId: step.id, status: "succeeded" }, { severity: "high", summary: `step ${step.order} succeeded — ${step.title}`, href: "/range" });
      changed = true;
    }
  }

  // threat↔run linking
  linkThreats(run);

  const allTerminal = run.stepResults.every((r) => ["succeeded", "blocked", "skipped"].includes(r.status));
  if (allTerminal || run.clockMs >= scenario.durationMs) {
    if (!allTerminal) {
      for (const res of run.stepResults) if (res.status === "active" || res.status === "pending") res.status = "skipped";
    }
    finishRun(run);
  } else if (changed) {
    store.markDirty();
  }
}

function linkThreats(run: RangeRun): void {
  const scenario = scenarioFor(run)!;
  for (const threat of store.s.threats) {
    if (threat.rangeRunId) continue;
    const detectedMs = new Date(threat.detectedAt).getTime();
    const runStartMs = new Date(run.startedAt).getTime();
    if (detectedMs < runStartMs) continue;
    // match a step by overlapping server ids or iocs within ±30 sim-s of its success/attempt
    for (let i = 0; i < scenario.steps.length; i++) {
      const res = run.stepResults[i];
      if (!res.at) continue;
      const impl = IMPL[scenario.steps[i].order];
      if (!impl) continue;
      const overlap = impl.serverIds().some((id) => threat.targetServerIds.includes(id));
      const within = Math.abs(detectedMs - new Date(res.at).getTime()) < 30_000;
      if (overlap && within) {
        threat.rangeRunId = run.id;
        threat.rangeStepId = scenario.steps[i].id;
        run.attackerLog.push({ at: store.now(), text: `linked ${threat.id} to step ${scenario.steps[i].order}` });
        store.markDirty();
        break;
      }
    }
  }
}

function finishRun(run: RangeRun): void {
  run.finishedAt = run.finishedAt ?? store.now();
  run.score = scoreRun(run);
  run.attackerLog.push({ at: store.now(), text: `run complete — grade ${run.score.grade}, ${run.score.stagesBlocked} blocked / ${run.score.stagesSucceeded} succeeded` });
  if (run.status === "running" || run.status === "paused") run.status = "completed";
  store.s.activeRunId = null;
  store.markDirty();
  bus.emit("range.run", { run }, { severity: "medium", summary: `run ${run.id} finished — grade ${run.score.grade}`, href: "/range" });
}

/** Was a run's agents paused? (baseline mode → true while run is active) */
export function baselineActive(): boolean {
  const run = store.s.rangeRuns.find((r) => r.id === store.s.activeRunId);
  return !!run && run.mode === "baseline" && (run.status === "running" || run.status === "paused");
}

export function listScenarios(): RangeScenario[] {
  return [HF_2026];
}

export function resetAttempts(): void {
  lastAttempt.clear();
}
