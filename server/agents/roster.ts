/** The six agents (SPEC §4) — roster accessors over store state. */
import type { Agent, AgentRole, ID } from "@/lib/types";
import { store } from "../store";

export const ROSTER_IDS = [
  "agt-saqr", "agt-hisn", "agt-athar", "agt-miftah", "agt-rahhal", "agt-bawwab",
] as const;

export function roster(): Agent[] {
  return store.s.agents;
}

export function agentById(id: ID): Agent | undefined {
  return store.agent(id);
}

export function agentByRole(role: AgentRole): Agent | undefined {
  return store.s.agents.find((a) => a.role === role);
}

export function activeAgents(): Agent[] {
  return store.s.agents.filter((a) => a.status !== "paused");
}
