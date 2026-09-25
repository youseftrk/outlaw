/**
 * Runtime singleton (SPEC §2). globalThis.__qalaa; lazy boot via
 * getRuntime(). Tick loop at 1000 ms / settings.sim.speed. Debounced JSON
 * persistence (≤1 write / 5 s) to .data/state.json; secrets separate.
 * fastForward(seconds) steps the sim clock synchronously for tests.
 */
import type { QalaaState } from "./store";
import { store } from "./store";
import { buildSeed } from "./seed";
import { bus } from "./bus";
import { brainTick, brainReset } from "./agents/brain";
import { setCounter } from "./ids";
import { counters } from "./shared";
import { tickRange, resetAttempts, baselineActive } from "./range/engine";
import { tickNoise, noiseReset } from "./range/noise";
import { tickMigrations, checkIncidentMigrations } from "./fleet/migrations";
import { tickApprovals, decide } from "./governance/approvals";
import { tickAuthority, accept as acceptLease, completeStepUp, stepUpCodeFor, setAuthorityTickActive } from "./authority/engine";
import { seedEntities, seedRules, assignOwnership, assignAgentEntities, seedObserveLeases } from "./seed/entities";
import { syncSshSettings } from "./fleet/adapters/ssh-config";
import { defaultDeliverySettings, hookDeliveryToBus } from "./messaging/delivery";
import { ensureSessionSecret } from "./auth";
import type { AgentStatus } from "@/lib/types";

export interface QalaaRuntime {
  bootedAt: string;
  tick(): Promise<void>;
  fastForward(simSeconds: number, opts?: { autoApprove?: boolean }): Promise<void>;
  reset(): void;
  started: boolean;
}

import { G } from "./shared";

declare global {
  var __qalaa: QalaaRuntime | undefined;
}

let intervalMs = 1000;

async function tick(): Promise<void> {
  setAuthorityTickActive(true);
  try {
    store.advanceTick();
    tickNoise();
    tickRange();
    const paused = baselineActive();
    await brainTick(paused);
    tickMigrations();
    if (!paused) checkIncidentMigrations(); // Rahhal-driven — agents paused in baseline
    tickApprovals();
    tickAuthority();
  } finally {
    setAuthorityTickActive(false);
  }
  store.flush();
}

function scheduleLoop(): void {
  if (G.__qalaaTimer) clearInterval(G.__qalaaTimer as ReturnType<typeof setInterval>);
  intervalMs = Math.max(50, Math.round(1000 / Math.max(0.25, store.s.settings.sim.speed)));
  const t = setInterval(() => void tick(), intervalMs);
  if (typeof t === "object" && "unref" in t) (t as { unref: () => void }).unref();
  G.__qalaaTimer = t;
}

const LEGACY_AGENT_IDS = new Set(["agt-cassidy", "agt-sundance", "agt-doc", "agt-belle", "agt-ringo", "agt-calamity"]);

const CALLSIGNS: Record<string, string> = {
  "agt-saqr": "the falcon",
  "agt-hisn": "the wall",
  "agt-athar": "the trace",
  "agt-miftah": "keeper of keys",
  "agt-rahhal": "the caravaneer",
  "agt-bawwab": "the gatekeeper",
};

/** Normalize persisted state written by older builds (callsigns, statuses,
 * metrics ranges) without a full reseed. */
function migrateState(state: QalaaState): void {
  for (const a of state.agents) {
    if (CALLSIGNS[a.id]) a.callsign = CALLSIGNS[a.id];
    if (a.status === "idle") a.status = "observing";
    if (!a.metrics.avgTimeToDetectSec) a.metrics.avgTimeToDetectSec = 12 + Math.round(Math.random() * 20);
    if (a.metrics.avgTimeToContainSec > 120) a.metrics.avgTimeToContainSec = 60 + Math.round(Math.random() * 50);
  }
  // state written before the rename used thr-outlaw for the system thread
  for (const t of state.threads) if (t.id === "thr-outlaw") t.id = "thr-qalaa";
  for (const m of state.messages) if (m.threadId === "thr-outlaw") m.threadId = "thr-qalaa";
  // thr-qalaa keeps agentId but always reads as the system thread
  const qalaa = state.threads.find((t) => t.id === "thr-qalaa");
  if (qalaa) { qalaa.title = "Qalaa"; qalaa.agentId = "agt-saqr"; }
  // settings.delivery arrived after the first persisted states
  if (!state.settings.delivery) state.settings.delivery = defaultDeliverySettings();
  // restore id counters so persisted entities never collide with new ids
  const bump = (prefix: string, ids: string[]) => {
    const max = Math.max(0, ...ids.map((id) => Number(id.split("-").pop()) || 0));
    if (max) setCounter(prefix, Math.max(max, counters().get(prefix) ?? 0));
  };
  bump("T-", state.threats.map((t) => t.id));
  bump("TR-", state.traces.map((t) => t.id));
  bump("A-", state.approvals.map((a) => a.id));
  bump("M-", state.migrations.map((m) => m.id));
  bump("MSG-", state.messages.map((m) => m.id));
  bump("RR-", state.rangeRuns.map((r) => r.id));
  bump("RQ-", state.research.map((q) => q.id));
  bump("EV-", state.events.map((e) => e.id));
  bump("SIG-", state.telemetry.map((t) => t.id));
  // authority arrived after the first persisted states — backfill entities,
  // ownership, rules and the standing observe permissions without a reseed
  const nowIso = new Date(state.simNowMs).toISOString();
  if (!state.entities?.length) state.entities = seedEntities(nowIso);
  if (!state.rules?.length) state.rules = seedRules();
  assignOwnership(state.servers);
  assignAgentEntities(state.agents);
  if (!state.leases) state.leases = seedObserveLeases(nowIso);
  if (!state.stepUps) state.stepUps = [];
  if (!state.records) state.records = [];
  bump("L-", state.leases.map((l) => l.id));
  bump("REC-", state.records.map((r) => r.id));
  bump("SU-", state.stepUps.map((c) => c.id));
}

export function getRuntime(): QalaaRuntime {
  if (globalThis.__qalaa) return globalThis.__qalaa;

  // load persisted state unless QALAA_RESET=1
  let state: QalaaState | null = null;
  if (process.env.QALAA_RESET !== "1") {
    state = store.load();
  }
  // state written before the agents were renamed for Qalaa can't be migrated field by field — reseed
  if (state && state.agents.some((a) => LEGACY_AGENT_IDS.has(a.id))) state = null;
  if (!state) {
    state = buildSeed(Date.now());
  }
  migrateState(state);
  // resume sim clock from persisted boot, but shift forward by real elapsed
  const booted = new Date(state.bootedAt).getTime();
  const persistedNow = state.simNowMs;
  const drift = Math.max(0, Date.now() - persistedNow);
  state.simNowMs = persistedNow + Math.min(drift, 300_000); // cap catch-up drift at 5 sim-min
  state.bootedAt = state.bootedAt || new Date().toISOString();
  void booted;

  store.init(state);
  store.loadSecrets();
  store.s.settings.llm.apiKeySet = !!store.secrets.llmApiKey;
  syncSshSettings();
  store.s.settings.delivery.secretSet = !!store.secrets.deliverySecret;
  store.s.settings.delivery.twilioAuthTokenSet = !!store.secrets.twilioAuthToken;
  hookDeliveryToBus(); // outbound copies of agent/system messages (SPEC §8)
  ensureSessionSecret();

  brainReset();
  resetAttempts();
  noiseReset();

  const rt: QalaaRuntime = {
    bootedAt: state.bootedAt,
    started: false,
    tick,
    async fastForward(simSeconds: number, opts: { autoApprove?: boolean } = {}) {
      for (let i = 0; i < simSeconds; i++) {
        await tick();
        if (opts.autoApprove) {
          for (const a of store.s.approvals.filter((x) => x.status === "pending")) {
            decide(a.id, "approve", "auto-policy");
          }
          // pending leases get accepted and step-up passed so range/e2e flows keep working
          for (const l of store.s.leases.filter((x) => x.status === "pending")) {
            const r = acceptLease(l.id, "auto-policy");
            if (r.ok && r.stepUpCode) completeStepUp(l.id, r.stepUpCode, "auto-policy");
          }
          for (const l of store.s.leases.filter((x) => x.status === "pending-step-up")) {
            const code = stepUpCodeFor(l.id);
            if (code) completeStepUp(l.id, code, "auto-policy");
          }
        }
        // flush microtasks so async plan steps progress between ticks
        await new Promise((r) => setImmediate(r));
      }
      store.flush();
    },
    reset() {
      brainReset();
      resetAttempts();
      noiseReset();
      store.wipe();
      store.init(buildSeed(Date.now()));
      store.markDirty();
      store.flush();
    },
  };

  globalThis.__qalaa = rt;
  scheduleLoop();
  rt.started = true;
  bus.emit("system", { booted: rt.bootedAt }, { summary: "qalaa runtime booted", href: "/" });
  return rt;
}

/** For instrumentation.ts — boot only on nodejs runtime. */
export function bootIfNode(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    getRuntime();
  }
}

export { store };
export type { AgentStatus };
