import {
  CAPABILITY_LABEL,
  STEP_UP_CAPABILITIES,
  TOOL_CAPABILITY,
  type Capability,
  type ToolName,
} from "@/lib/types";

export interface AgentPower {
  capability: Capability;
  label: string;
  plain: string;
  stepUp: boolean;
}

const PLAIN: Record<Capability, string> = {
  observe: "Look at a system without changing anything",
  contain: "Cut a system off so a problem cannot spread",
  credentials: "Switch off leaked keys and issue new ones",
  data: "Set suspicious data aside until someone checks it",
  repair: "Fix, update or rebuild a system",
};

const ORDER: Capability[] = ["observe", "contain", "credentials", "data", "repair"];

/** The permission groups an agent's tools fall into, in a fixed order. */
export function agentPowers(tools: ToolName[]): AgentPower[] {
  const caps = new Set<Capability>();
  for (const t of tools) {
    const c = TOOL_CAPABILITY[t];
    if (c) caps.add(c);
  }
  return ORDER.filter((c) => caps.has(c)).map((c) => ({
    capability: c,
    label: CAPABILITY_LABEL[c],
    plain: PLAIN[c],
    stepUp: STEP_UP_CAPABILITIES.includes(c),
  }));
}
