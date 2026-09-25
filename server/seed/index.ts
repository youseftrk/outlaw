/** Deterministic seed — assembles the full QalaaState (SPEC §0, §2). */
import type { QalaaState } from "../store";
import { seedWorld } from "./worldState";
import { seedFleet } from "./fleet";
import { seedAgents } from "./agents";
import { seedPolicies } from "./policies";
import { seedHistory } from "./history";
import { seedEntities, seedRules, assignOwnership, assignAgentEntities, seedObserveLeases } from "./entities";
import { DEFAULT_SSH_SETTINGS } from "../fleet/adapters/ssh-config";
import { defaultDeliverySettings } from "../messaging/delivery";

export function buildSeed(nowMs: number): QalaaState {
  const nowIso = new Date(nowMs).toISOString();
  const world = seedWorld(nowIso);

  // egress open everywhere at seed
  const servers = seedFleet(nowIso, world);
  assignOwnership(servers);
  for (const s of servers) world.network.egressAllowed[s.id] = true;

  const byRole = {
    all: servers.map((s) => s.id),
    worker: servers.filter((s) => s.role === "worker").map((s) => s.id),
    prodAll: servers.filter((s) => s.env === "prod").map((s) => s.id),
  };
  const agents = seedAgents(nowIso, byRole);
  assignAgentEntities(agents);
  // every agent protects something sensible for the UI
  for (const a of agents) {
    for (const sid of a.assignedServerIds) {
      const srv = servers.find((s) => s.id === sid);
      if (srv && !srv.protectedBy.includes(a.id)) srv.protectedBy.push(a.id);
    }
  }

  const policies = seedPolicies(nowIso);
  const history = seedHistory(nowIso, servers, agents);

  return {
    bootedAt: nowIso,
    simNowMs: nowMs,
    tick: 0,
    agents,
    servers,
    threats: history.threats,
    approvals: [],
    threads: history.threads,
    messages: history.messages,
    policies,
    migrations: history.migrations,
    traces: history.traces,
    telemetry: [],
    events: [],
    rangeRuns: [],
    activeRunId: null,
    research: [],
    settings: {
      llm: { provider: "none", baseUrl: "", model: "", enabled: false, apiKeySet: false },
      ssh: { ...DEFAULT_SSH_SETTINGS, hostMap: {} },
      operator: { name: "Operator", phone: "+1 555 0100", org: "Frontier Hub" },
      sim: { speed: 1, autoRun: true, quietHours: false },
      delivery: defaultDeliverySettings(),
    },
    world,
    entities: seedEntities(nowIso),
    rules: seedRules(),
    leases: seedObserveLeases(nowIso),
    stepUps: [],
    records: [],
  };
}
