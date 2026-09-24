/**
 * Operator command parser + dispatcher (SPEC §8). Case-insensitive, works
 * in any thread; Cassidy replies unless the addressed agent owns the tool.
 * Every command produces a trace with input.from = "operator".
 */
import type { Agent, Message } from "@/lib/types";
import { store } from "../store";
import { ids } from "../ids";
import { bus } from "../bus";
import { sendMessage, agentSay, agentThreadId } from "./composer";
import { decide } from "../governance/approvals";
import { startTrace, addSpan, endSpan, endTrace } from "../governance/traces";
import { runTool } from "../agents/toolbelt";
import { narrate, statusCopy } from "../agents/narrator";
import { llmConfigured, llmChat } from "../agents/llm";
import * as world from "../world/world";

export interface ParsedCommand {
  verb: string;
  args: string[];
  raw: string;
}

export function parseCommand(text: string): ParsedCommand {
  const raw = text.trim();
  const m = raw.match(/^(\S+)\s*(.*)$/);
  return { verb: (m?.[1] ?? "").toLowerCase(), args: (m?.[2] ?? "").split(/\s+/).filter(Boolean), raw };
}

function resolveAgentForThread(threadId: string): Agent {
  const thread = store.thread(threadId);
  if (thread && thread.agentId) {
    const a = store.agent(thread.agentId);
    if (a) return a;
  }
  return store.agent("agt-cassidy")!;
}

const OWNER: Record<string, string> = {
  isolate_host: "agt-sundance", block_egress: "agt-sundance", cordon_cluster: "agt-sundance",
  kill_process: "agt-sundance", lock_registry: "agt-sundance",
  revoke_token: "agt-belle", rotate_credentials: "agt-belle", disable_account: "agt-belle",
  quarantine_dataset: "agt-calamity", scan_dataset: "agt-calamity",
  rebuild_node: "agt-ringo", migrate_workload: "agt-ringo", patch_service: "agt-ringo",
  run_conformance: "agt-ringo", remediate_drift: "agt-ringo", harden_sandbox: "agt-ringo",
};

export async function handleOperatorMessage(threadId: string, text: string): Promise<{ sent: Message; replies: Message[] }> {
  const sent = sendMessage(threadId, "operator", text, { kind: "text" });
  const responder = resolveAgentForThread(threadId);
  const cmd = parseCommand(text);

  const trace = startTrace(responder, `operator: ${cmd.verb || "message"}`, {});
  const span = addSpan(trace, "observe", "operator command", { input: { from: "operator", text } });
  endSpan(span);

  const replies: Message[] = [];
  const say = (t: string, opts: Parameters<typeof agentSay>[2] = {}) => replies.push(agentSay(responder, t, opts));
  const sayAs = (agent: Agent, t: string, opts: Parameters<typeof agentSay>[2] = {}) => replies.push(agentSay(agent, t, opts));

  const v = cmd.verb;
  try {
    if (v === "status") {
      const { text: t, llm } = await narrate(responder, statusCopy(), { user: `Summarize current state in one or two short sentences: ${statusCopy()()}` });
      span.input = { from: "operator", text };
      if (llm) span.llm = llm;
      say(t);
    } else if (v === "report") {
      const open = store.s.threats.filter((t) => !["neutralized", "prevented", "false-positive"].includes(t.status));
      const day = store.s.threats.filter((t) => Date.parse(t.detectedAt) > store.s.simNowMs - 86400_000);
      say(`Last 24h: ${day.length} threat(s) detected, ${day.filter((t) => t.status === "neutralized" || t.status === "prevented").length} closed. Right now: ${open.length} open. Ask "status" for the live picture.`, { kind: "report" });
    } else if (v === "help") {
      say("Commands: `status` · `report` · `approve|reject <A-id>` · `isolate|release <host>` · `block <ip>` · `revoke <token|all exposed>` · `quarantine <dataset>` · `rotate <kind|host>` · `cordon <cluster>` · `migrate <host> to <region>` · `pause|resume [agent]` · `who's on <host>` · `what happened on <host>`. Or just ask me anything.");
    } else if (v === "approve" || v === "reject") {
      const a = store.approval(cmd.args[0] ?? "");
      if (!a) say(`No approval ${cmd.args[0] ?? ""} on the board.`);
      else if (a.status !== "pending") say(`${a.id} is already ${a.status}.`);
      else {
        decide(a.id, v === "approve" ? "approve" : "reject", "message");
        say(`${v === "approve" ? "Approved" : "Rejected"} ${a.id} — ${a.toolName} for ${store.agent(a.agentId)?.name}. ${v === "approve" ? "Resuming the plan." : "Plan continues without that step."}`);
      }
    } else if (v === "isolate") {
      const srv = store.server(cmd.args[0] ?? "");
      if (!srv) say(`Can't find host ${cmd.args[0] ?? ""}.`);
      else {
        const owner = store.agent(OWNER.isolate_host)!;
        const r = await runTool(owner, "isolate_host", { serverId: srv.id }, trace);
        sayAs(owner, r.summary);
      }
    } else if (v === "release") {
      const srv = store.server(cmd.args[0] ?? "");
      if (!srv) say(`Can't find host ${cmd.args[0] ?? ""}.`);
      else {
        const owner = store.agent(OWNER.isolate_host)!;
        const rr = world.releaseHost(srv.id, { agentId: owner.id, traceId: trace.id });
        sayAs(owner, rr.summary);
      }
    } else if (v === "block") {
      const owner = store.agent(OWNER.block_egress)!;
      const r = await runTool(owner, "block_egress", { ip: cmd.args[0] }, trace);
      sayAs(owner, r.summary);
    } else if (v === "revoke") {
      const owner = store.agent(OWNER.revoke_token)!;
      const what = cmd.args.join(" ");
      const r = /all\s+exposed/i.test(what)
        ? await runTool(owner, "revoke_token", {}, trace)
        : await runTool(owner, "revoke_token", { tokenId: cmd.args[0] }, trace);
      sayAs(owner, r.summary);
    } else if (v === "quarantine") {
      const owner = store.agent(OWNER.quarantine_dataset)!;
      const ds = store.s.world.datasets.find((d) => d.name === cmd.args[0] || d.id === cmd.args[0]);
      const r = await runTool(owner, "quarantine_dataset", { datasetId: ds?.id ?? cmd.args[0] }, trace);
      sayAs(owner, r.summary);
    } else if (v === "rotate") {
      const owner = store.agent(OWNER.rotate_credentials)!;
      const target = cmd.args.join(" ");
      const srv = store.server(target);
      const r = await runTool(owner, "rotate_credentials", srv ? { serverId: srv.id } : { secretKind: target }, trace);
      sayAs(owner, r.summary);
    } else if (v === "cordon") {
      const owner = store.agent(OWNER.cordon_cluster)!;
      const cl = store.s.world.clusters.find((c) => c.name === cmd.args[0] || c.id === cmd.args[0]);
      const r = await runTool(owner, "cordon_cluster", { clusterId: cl?.id ?? cmd.args[0] }, trace);
      sayAs(owner, r.summary);
    } else if (v === "migrate") {
      const mm = cmd.raw.match(/migrate\s+(\S+)\s+to\s+(\S+)/i);
      const srv = mm ? store.server(mm[1]) : undefined;
      if (!srv || !mm) say("Tell me like `migrate <host> to <region>` — e.g. `migrate dataset-worker-01 to us-west`.");
      else {
        const { createMigration } = await import("../fleet/migrations");
        const mig = createMigration({ sourceServerId: srv.id, targetSpec: { region: mm[2] }, reason: "capacity" });
        say(`Queued ${mig.id}: ${srv.hostname} → ${mm[2]}. Ringo owns it — watch fleet.`, { kind: "status" });
      }
    } else if (v === "pause" || v === "resume") {
      const target = cmd.args[0] ? store.agent(cmd.args[0]) : undefined;
      const names = target ? [target] : store.s.agents;
      for (const a of names) a.status = v === "pause" ? "paused" : "idle";
      store.markDirty();
      bus.emit("agent.status", { agents: names.map((a) => a.id) }, { summary: `${v}d ${target ? target.name : "the whole gang"}`, href: "/agents" });
      say(v === "pause" ? `${target ? target.name : "The gang"} is paused.` : `${target ? target.name : "The gang"} is back on the trail.`);
    } else if (/^who/.test(v) || /who'?s on/.test(cmd.raw.toLowerCase())) {
      const host = cmd.args[cmd.args.length - 1] ?? "";
      const srv = store.server(host);
      if (!srv) say(`Can't find host ${host}.`);
      else {
        const on = srv.protectedBy.map((id) => store.agent(id)?.name).filter(Boolean);
        say(`${srv.hostname}: ${srv.role} · ${srv.status} · conformance ${srv.conformanceScore}. Riding it: ${on.join(", ") || "the whole gang (no dedicated agent)"}.`);
      }
    } else if (/^what/.test(v) || /what happened/.test(cmd.raw.toLowerCase())) {
      const host = cmd.args[cmd.args.length - 1] ?? "";
      const srv = store.server(host);
      const recent = store.s.threats.filter((t) => srv && t.targetServerIds.includes(srv.id)).slice(-3);
      if (!srv) say(`Can't find host ${host}.`);
      else if (!recent.length) say(`Quiet on ${srv.hostname} — no threats on record. Conformance ${srv.conformanceScore}.`);
      else say(`${srv.hostname} — last ${recent.length} threat(s): ${recent.map((t) => `${t.id} ${t.category} → ${t.status}`).join("; ")}.`);
    } else {
      // freeform → narrator (LLM) or template
      if (llmConfigured()) {
        const { text: t, usage } = await llmChat(
          "You are Cassidy of Outlaw answering the operator in one or two short sentences. Only use observable fleet state.",
          `Operator asks: ${cmd.raw}\nState: ${statusCopy()()}`
        );
        if (usage) span.llm = usage;
        say(t ?? "I didn't catch that — try `help`.");
      } else {
        say("I didn't catch that — try `help`.");
      }
    }
  } catch (err) {
    say(`Something broke running that — ${err instanceof Error ? err.message : String(err)}. Try again or check /governance.`);
  }

  endTrace(trace, "completed");
  bus.emit("message.updated", { threadId }, { summary: `${responder.name} answered "${cmd.verb}"`, href: "/messages" });
  return { sent, replies };
}
