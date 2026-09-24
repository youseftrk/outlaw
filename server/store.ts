/**
 * In-memory state + debounced JSON persistence to .data/state.json.
 * All entities from Bootstrap plus traces, messages, telemetry ring (2000),
 * events ring (5000), range runs and research queries.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Agent,
  Approval,
  Message,
  Migration,
  OutlawEvent,
  Policy,
  RangeRun,
  ResearchQuery,
  Server,
  Settings,
  TelemetrySignal,
  Thread,
  Threat,
  Trace,
  ISODate,
  ID,
} from "@/lib/types";
import type { World } from "./world/world";

export const TELEMETRY_CAP = 2000;
export const EVENTS_CAP = 5000;

export interface OutlawSecrets {
  llmApiKey?: string;
}

export interface OutlawState {
  bootedAt: ISODate;
  /** sim-time epoch ms — advances 1000 per tick */
  simNowMs: number;
  tick: number;
  agents: Agent[];
  servers: Server[];
  threats: Threat[];
  approvals: Approval[];
  threads: Thread[];
  messages: Message[];
  policies: Policy[];
  migrations: Migration[];
  traces: Trace[];
  settings: Settings;
  telemetry: TelemetrySignal[];
  events: OutlawEvent[];
  rangeRuns: RangeRun[];
  activeRunId: ID | null;
  research: ResearchQuery[];
  world: World;
}

const DATA_DIR = join(process.cwd(), ".data");
const STATE_FILE = join(DATA_DIR, "state.json");
const SECRETS_FILE = join(DATA_DIR, "secrets.json");

const persistEnabled = () =>
  !process.env.VITEST && process.env.OUTLAW_NO_PERSIST !== "1";

import { G } from "./shared";

export const store = {
  get state(): OutlawState | null {
    return G.__outlawState ?? null;
  },
  set state(v: OutlawState | null) {
    G.__outlawState = v;
  },
  get secrets(): OutlawSecrets {
    return (G.__outlawSecrets ??= {});
  },
  dirty: false,
  lastWriteMs: 0,
  flushTimer: null as ReturnType<typeof setTimeout> | null,

  init(state: OutlawState): void {
    this.state = state;
  },

  get s(): OutlawState {
    if (!this.state) throw new Error("store not initialized — getRuntime() first");
    return this.state;
  },

  /** sim clock */
  now(): ISODate {
    return new Date(this.s.simNowMs).toISOString();
  },
  advanceTick(): void {
    this.s.simNowMs += 1000;
    this.s.tick += 1;
  },

  markDirty(): void {
    this.dirty = true;
    if (!persistEnabled()) return;
    if (!this.flushTimer) {
      const wait = Math.max(0, 5000 - (Date.now() - this.lastWriteMs));
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, wait);
      if (typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
        (this.flushTimer as { unref: () => void }).unref();
      }
    }
  },

  flush(): void {
    if (!persistEnabled() || !this.state || !this.dirty) return;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const tmp = STATE_FILE + ".tmp";
      writeFileSync(tmp, JSON.stringify(this.state));
      renameSync(tmp, STATE_FILE);
      this.dirty = false;
      this.lastWriteMs = Date.now();
    } catch (err) {
      console.error("[outlaw] state flush failed:", err);
    }
  },

  saveSecrets(): void {
    if (!persistEnabled()) return;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(SECRETS_FILE, JSON.stringify(this.secrets));
    } catch (err) {
      console.error("[outlaw] secrets flush failed:", err);
    }
  },

  loadSecrets(): void {
    try {
      if (existsSync(SECRETS_FILE)) {
        G.__outlawSecrets = JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
      }
    } catch {
      G.__outlawSecrets = {};
    }
  },

  load(): OutlawState | null {
    if (!persistEnabled()) return null;
    try {
      if (existsSync(STATE_FILE)) {
        const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as OutlawState;
        return parsed;
      }
    } catch (err) {
      console.error("[outlaw] state load failed:", err);
    }
    return null;
  },

  wipe(): void {
    try {
      if (existsSync(STATE_FILE)) {
        const { unlinkSync } = require("node:fs") as typeof import("node:fs");
        unlinkSync(STATE_FILE);
      }
    } catch {
      /* noop */
    }
  },

  /* ── ring buffers ── */
  pushTelemetry(sig: TelemetrySignal): void {
    const t = this.s.telemetry;
    t.push(sig);
    if (t.length > TELEMETRY_CAP) t.splice(0, t.length - TELEMETRY_CAP);
  },
  pushEvent(ev: OutlawEvent): void {
    const e = this.s.events;
    e.push(ev);
    if (e.length > EVENTS_CAP) e.splice(0, e.length - EVENTS_CAP);
  },

  /* ── lookups ── */
  agent(id: ID): Agent | undefined {
    return this.s.agents.find((a) => a.id === id || a.name.toLowerCase() === id.toLowerCase());
  },
  server(idOrHost: string): Server | undefined {
    return this.s.servers.find(
      (s) => s.id === idOrHost || s.hostname === idOrHost
    );
  },
  threat(id: ID): Threat | undefined {
    return this.s.threats.find((t) => t.id === id);
  },
  trace(id: ID): Trace | undefined {
    return this.s.traces.find((t) => t.id === id);
  },
  approval(id: ID): Approval | undefined {
    return this.s.approvals.find((a) => a.id === id);
  },
  thread(id: ID): Thread | undefined {
    return this.s.threads.find((t) => t.id === id);
  },
  migration(id: ID): Migration | undefined {
    return this.s.migrations.find((m) => m.id === id);
  },
};
