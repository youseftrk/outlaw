/**
 * Authority seed (docs/PIVOT.md §3): the three entities, their house rules,
 * deterministic server ownership by environment, per-agent entity ids, data
 * classes on servers, and one long-lived observe permission per owner.
 */
import type { Agent, AuthorityLease, DataClass, Entity, HouseRules, Server } from "@/lib/types";
import { isoIn } from "../time";

export const ENT_RESPONSE = "ent-response";
export const ENT_DATA = "ent-data";
export const ENT_RESEARCH = "ent-research";

export function seedEntities(nowIso: string): Entity[] {
  return [
    {
      id: ENT_RESPONSE,
      name: "National Emergency Response Authority",
      shortName: "Response",
      kind: "government",
      jurisdiction: "Abu Dhabi, UAE",
      mandate: "Operates the six agents that answer incidents across government systems.",
      operatesAgents: true,
      createdAt: nowIso,
    },
    {
      id: ENT_DATA,
      name: "National Data Authority",
      shortName: "Data",
      kind: "government",
      jurisdiction: "Abu Dhabi, UAE",
      mandate: "Owns the production estate — APIs, web, databases, storage, workers and prod clusters.",
      operatesAgents: false,
      createdAt: nowIso,
    },
    {
      id: ENT_RESEARCH,
      name: "Research & Compute Authority",
      shortName: "Research",
      kind: "government",
      jurisdiction: "Abu Dhabi, UAE",
      mandate: "Owns research and staging systems — the registry, eval clusters and staging.",
      operatesAgents: false,
      createdAt: nowIso,
    },
  ];
}

/** Per-owner ceiling any permission must fit under (scope-add: house rules). */
export function seedRules(): HouseRules[] {
  return [
    {
      entityId: ENT_DATA,
      allowed: ["observe", "contain", "data"],
      stepUp: ["contain", "data"],
      neverShared: ["personal-data", "health-data"],
      maxDurationSec: 2 * 3600,
    },
    {
      entityId: ENT_RESEARCH,
      allowed: ["observe", "contain", "repair"],
      stepUp: ["repair"],
      neverShared: [],
      maxDurationSec: 4 * 3600,
    },
    {
      entityId: ENT_RESPONSE,
      // operates the agents; owns no systems to lend
      allowed: [],
      stepUp: [],
      neverShared: [],
      maxDurationSec: 0,
    },
  ];
}

/** Deterministic ownership: prod → National Data Authority, research+staging → Research & Compute. */
export function ownerForServer(srv: Pick<Server, "env">): string {
  return srv.env === "prod" ? ENT_DATA : ENT_RESEARCH;
}

/** What kind of data lives on a server (deterministic by role). */
export function dataClassesForServer(srv: Pick<Server, "role">): DataClass[] {
  switch (srv.role) {
    case "worker":
      return ["personal-data"];
    case "database":
      return ["personal-data", "financial-data"];
    case "storage":
      return ["personal-data"];
    default:
      return ["infrastructure"];
  }
}

/** Assign ownerEntityId + dataClasses onto the seeded servers, in place. */
export function assignOwnership(servers: Server[]): void {
  for (const srv of servers) {
    srv.ownerEntityId = ownerForServer(srv);
    srv.dataClasses = dataClassesForServer(srv);
  }
}

/** The garrison belongs to the response entity. */
export function assignAgentEntities(agents: Agent[]): void {
  for (const a of agents) a.entityId = ENT_RESPONSE;
}

/**
 * One long-lived observe permission per owner — lets agents look (not touch)
 * across that owner's estate. Fixed ids + window so reseeds are identical;
 * expiry set ~30 sim-days out and renewed on each fresh seed.
 */
export function seedObserveLeases(nowIso: string): AuthorityLease[] {
  const nowMs = new Date(nowIso).getTime();
  const start = isoIn(-86400, nowMs); // accepted a sim-day ago
  const durationSec = 30 * 86400;
  const mk = (ownerEntityId: string): AuthorityLease => ({
    id: `lease-observe-${ownerEntityId.replace("ent-", "")}`,
    requestingEntityId: ENT_RESPONSE,
    ownerEntityId,
    capability: "observe",
    scope: {},
    justification: "Standing visibility so the garrison can watch for trouble. Look only — no touch.",
    durationSec,
    status: "active",
    requestedAt: start,
    acceptedAt: start,
    acceptedBy: "the owner",
    activatedAt: start,
    expiresAt: isoIn(durationSec - 86400, nowMs),
    stepUpRequired: false,
    uses: 0,
  });
  return [mk(ENT_DATA), mk(ENT_RESEARCH)];
}
