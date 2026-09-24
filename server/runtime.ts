/**
 * Runtime singleton (SPEC §2). globalThis.__outlaw; lazy boot via
 * getRuntime(). Tick loop at 1000 ms / settings.sim.speed. Debounced JSON
 * persistence (≤1 write / 5 s) to .data/state.json; secrets separate.
 * fastForward(seconds) steps the sim clock synchronously for tests.
 */
import type { OutlawState } from "./store";
import { store } from "./store";
import { buildSeed } from "./seed";
import { bus } from "./bus";
import { brainTick, brainReset } from "./agents/brain";
import { tickRange, resetAttempts, baselineActive } from "./range/engine";
import { tickNoise, noiseReset } from "./range/noise";
import { tickMigrations, checkIncidentMigrations } from "./fleet/migrations";
import { tickApprovals, decide } from "./governance/approvals";
import type { AgentStatus } from "@/lib/types";

export interface OutlawRuntime {
  bootedAt: string;
  tick(): Promise<void>;
  fastForward(simSeconds: number, opts?: { autoApprove?: boolean }): Promise<void>;
  reset(): void;
  started: boolean;
}

import { G } from "./shared";

declare global {
  // eslint-disable-next-line no-var
  var __outlaw: OutlawRuntime | undefined;
}

let intervalMs = 1000;

async function tick(): Promise<void> {
  store.advanceTick();
  tickNoise();
  tickRange();
  const paused = baselineActive();
  await brainTick(paused);
  tickMigrations();
  if (!paused) checkIncidentMigrations(); // Ringo-driven — agents paused in baseline
  tickApprovals();
  store.flush();
}

function scheduleLoop(): void {
  if (G.__outlawTimer) clearInterval(G.__outlawTimer as ReturnType<typeof setInterval>);
  intervalMs = Math.max(50, Math.round(1000 / Math.max(0.25, store.s.settings.sim.speed)));
  const t = setInterval(() => void tick(), intervalMs);
  if (typeof t === "object" && "unref" in t) (t as { unref: () => void }).unref();
  G.__outlawTimer = t;
}

export function getRuntime(): OutlawRuntime {
  if (globalThis.__outlaw) return globalThis.__outlaw;

  // load persisted state unless OUTLAW_RESET=1
  let state: OutlawState | null = null;
  if (process.env.OUTLAW_RESET !== "1") {
    state = store.load();
  }
  if (!state) {
    state = buildSeed(Date.now());
  }
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

  brainReset();
  resetAttempts();
  noiseReset();

  const rt: OutlawRuntime = {
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

  globalThis.__outlaw = rt;
  scheduleLoop();
  rt.started = true;
  bus.emit("system", { booted: rt.bootedAt }, { summary: "outlaw runtime booted", href: "/" });
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
