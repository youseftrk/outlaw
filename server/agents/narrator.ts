/**
 * Narrator (SPEC §7): produces `reason` span text and operator-facing
 * message copy — LLM when enabled + key set, templates otherwise.
 * Voice: DESIGN.md §5 — first person, short, concrete, names hosts/ids.
 */
import type { Agent, Threat } from "@/lib/types";
import { llmChat, llmConfigured } from "./llm";
import { store } from "../store";

const SYSTEM = `You write one-line operator texts for Qalaa, an agent-run threat-intel platform. First person, short, concrete. Name hosts and ids. No jargon, no exclamation marks.`;

export async function narrate(
  agent: Agent,
  template: () => string,
  llmPrompt?: { system?: string; user: string }
): Promise<{ text: string; llm?: import("@/lib/types").LLMUsage }> {
  if (llmPrompt && llmConfigured()) {
    const { text, usage } = await llmChat(llmPrompt.system ?? SYSTEM, llmPrompt.user);
    if (text) return { text, llm: usage };
    return { text: template(), llm: usage }; // fallback flag recorded
  }
  return { text: template() };
}

/* ── templates ── */

export function detectionCopy(threat: Threat, actorName: string, action: string): () => string {
  const host = firstHost(threat);
  return () =>
    `Heads up — ${threat.title.toLowerCase()} on ${host}. ${actorName} is on it (${action}). I'll text you when it's clear.`;
}

export function approvalCopy(agentName: string, tool: string, target: string, approvalId: string): () => string {
  return () => `Need your call: ${agentName} wants to run ${tool} on ${target}. Approve ${approvalId} or reject ${approvalId} — it expires in 10 minutes.`;
}

export function resolutionCopy(threat: Threat, what: string): () => string {
  const host = firstHost(threat);
  return () => `Clear — ${threat.title.toLowerCase()} on ${host} is ${what}. ${threat.id} closed.`;
}

export function statusCopy(): () => string {
  return () => {
    const s = store.s;
    const open = s.threats.filter((t) => !["neutralized", "prevented", "false-positive"].includes(t.status)).length;
    const pending = s.approvals.filter((a) => a.status === "pending").length;
    const compromised = s.servers.filter((x) => x.status === "compromised").length;
    return `${s.servers.length} servers up, ${open} open threat${open === 1 ? "" : "s"}, ${pending} approval${pending === 1 ? "" : "s"} waiting${compromised ? `, ${compromised} host${compromised === 1 ? "" : "s"} compromised` : ""}. Garrison is running autonomous.`;
  };
}

export function firstHost(threat: Threat): string {
  const id = threat.targetServerIds[0];
  return (id && store.server(id)?.hostname) || id || "the fleet";
}
