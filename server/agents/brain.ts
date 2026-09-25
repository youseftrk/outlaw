/**
 * Detection + decision engine (SPEC §4.1, §4.2). Deterministic rules over
 * the 60-sim-s telemetry window; every signal kind is covered. Threats get
 * a response plan executed step-per-tick through governance.
 *
 * BLIND BOUNDARY: this module never sees range internals — only telemetry,
 * threats, the observed world, and store entities.
 */
import type {
  Agent, GeoPoint, IOC, KillChainStageName, Message, Severity, TelemetrySignal,
  Threat, ThreatCategory, ToolName, ID,
} from "@/lib/types";
import { bus } from "../bus";
import { store } from "../store";
import { emitSignal, telemetryWindow } from "../telemetry";
import * as world from "../world/world";
import { ids } from "../ids";
import { startTrace, addSpan, endSpan, endTrace } from "../governance/traces";
import { runTool, type ToolArgs } from "./toolbelt";
import { narrate, detectionCopy } from "./narrator";
import { agentSay, threatAlert, threatResolved } from "../messaging/composer";
import { refreshServerConformance } from "../fleet/conformance";
import { G } from "../shared";

/* ─────────────── detection rules ─────────────── */

interface RuleHit {
  category: ThreatCategory;
  severity: Severity;
  title: string;
  signals: TelemetrySignal[];
  serverIds: ID[];
  iocs: IOC[];
  killChainStage: KillChainStageName;
  techniqueIds: string[];
  preventable?: boolean;
}

const seen = new Set<string>();
/** threats recently created keyed by server+category for dedup (5 min) */
const recent = new Map<string, number>();

function iocFromSignal(sig: TelemetrySignal): IOC[] {
  const iocs: IOC[] = [];
  const a = sig.attributes;
  if (typeof a.ip === "string") iocs.push({ type: "ip", value: a.ip, confidence: 0.8, firstSeen: sig.at, tags: [] });
  if (typeof a.account === "string") iocs.push({ type: "account", value: a.account, confidence: 0.9, firstSeen: sig.at, tags: [] });
  if (typeof a.tokenId === "string") iocs.push({ type: "token", value: a.tokenId, confidence: 0.9, firstSeen: sig.at, tags: [] });
  if (typeof a.tokenIds === "string") for (const v of a.tokenIds.split(",").filter(Boolean)) iocs.push({ type: "token", value: v.trim(), confidence: 0.85, firstSeen: sig.at, tags: [] });
  if (typeof a.dataset === "string") iocs.push({ type: "dataset", value: a.dataset, confidence: 0.85, firstSeen: sig.at, tags: [] });
  if (typeof a.cve === "string") iocs.push({ type: "cve", value: a.cve, confidence: 0.95, firstSeen: sig.at, tags: [] });
  if (typeof a.domain === "string") iocs.push({ type: "domain", value: a.domain, confidence: 0.8, firstSeen: sig.at, tags: [] });
  return iocs;
}

function sourceGeo(sig: TelemetrySignal): { ip?: string; geo?: GeoPoint; actorLabel?: string } {
  const a = sig.attributes;
  const geo = typeof a.lat === "number" && typeof a.lng === "number"
    ? { lat: a.lat, lng: a.lng, city: a.city as string | undefined, country: a.country as string | undefined }
    : undefined;
  return { ip: a.ip as string | undefined, geo, actorLabel: a.actor as string | undefined };
}

function correlate(signals: TelemetrySignal[]): RuleHit[] {
  const hits: RuleHit[] = [];
  const bySignal = new Map<string, TelemetrySignal[]>();
  for (const s of signals) {
    if (seen.has(s.id)) continue;
    const list = bySignal.get(s.signal) ?? [];
    list.push(s);
    bySignal.set(s.signal, list);
  }
  const get = (k: TelemetrySignal["signal"]) => bySignal.get(k) ?? [];
  const mark = (ss: TelemetrySignal[]) => ss.forEach((s) => seen.add(s.id));
  const host = (s: TelemetrySignal) => (s.serverId ? store.server(s.serverId)?.hostname ?? s.serverId : "fleet");

  const mkHit = (category: ThreatCategory, severity: Severity, title: string, sigs: TelemetrySignal[], stage: KillChainStageName, techniques: string[], preventable = false): RuleHit => ({
    category, severity, title,
    signals: sigs,
    serverIds: [...new Set(sigs.map((s) => s.serverId).filter(Boolean))] as ID[],
    iocs: sigs.flatMap(iocFromSignal),
    killChainStage: stage,
    techniqueIds: techniques,
    preventable,
  });

  // explicit attack class (noise + drills) — maps to a category directly
  const CLASS_STAGE: Record<string, KillChainStageName> = {
    "brute-force": "credential-access", "credential-stuffing": "credential-access",
    "prompt-injection": "execution", "misconfiguration": "recon", "recon": "recon",
    "c2-beacon": "command-and-control", "anomalous-egress": "command-and-control",
  };
  const CLASS_TECH: Record<string, string[]> = {
    "brute-force": ["T1110"], "credential-stuffing": ["T1110.004"],
    "prompt-injection": ["T1059"], "recon": ["T1595"], "c2-beacon": ["T1071"],
    "anomalous-egress": ["T1071"], "misconfiguration": ["T1496"],
  };
  const VALID_CLASSES = new Set(Object.keys(CLASS_STAGE));
  for (const s of signals) {
    const ac = s.attributes.attackClass;
    if (typeof ac !== "string" || !VALID_CLASSES.has(ac) || seen.has(s.id)) continue;
    hits.push(mkHit(ac as ThreatCategory, s.severity, `${ac} on ${host(s)}`, [s], CLASS_STAGE[ac], CLASS_TECH[ac] ?? [], ["misconfiguration", "prompt-injection"].includes(ac)));
    seen.add(s.id);
  }

  // auth.geo-anomaly + api.enumeration-burst same account → account-hijack
  const geo = get("auth.geo-anomaly");
  const bursts = get("api.enumeration-burst");
  const paired = new Set<string>();
  for (const g of geo) {
    const burst = bursts.find((b) => b.attributes.account && b.attributes.account === g.attributes.account);
    if (burst) {
      paired.add(g.id); paired.add(burst.id);
      hits.push(mkHit("account-hijack", "medium", `account ${g.attributes.account} showing impossible-travel + enumeration`, [g, burst], "initial-access", ["T1078", "T1595"]));
    }
  }
  for (const g of geo.filter((x) => !paired.has(x.id))) {
    hits.push(mkHit("recon", "low", `geo-anomalous login for ${g.attributes.account ?? "account"}`, [g], "recon", ["T1078"]));
  }
  for (const b of bursts.filter((x) => !paired.has(x.id))) {
    hits.push(mkHit("recon", "low", `API enumeration burst on ${host(b)}`, [b], "recon", ["T1595"]));
  }

  for (const s of get("auth.admin-token-minted")) {
    hits.push(mkHit("privilege-escalation", "high", `admin token minted on ${host(s)} with no session`, [s], "privilege-escalation", ["T1078", "T1552"]));
  }
  for (const s of get("auth.anomaly")) {
    hits.push(mkHit("leaked-credential", "medium", `token used from new ASN on ${host(s)}`, [s], "credential-access", ["T1552.001"], true));
  }
  for (const s of [...get("process.plugin-install"), ...get("process.new-listener")]) {
    const srv = s.serverId ? store.server(s.serverId) : undefined;
    const hot = srv && (srv.role === "registry" || srv.env === "prod");
    hits.push(mkHit("rce", hot ? "critical" : "high", `${s.signal === "process.plugin-install" ? "plugin install" : "new listener"} on ${host(s)}`, [s], "execution", ["T1190", "T1505.003"]));
  }
  for (const s of get("process.shell-spawn")) {
    const ti = get("worker.template-render-anomaly").find((t) => t.serverId === s.serverId);
    hits.push(mkHit(ti ? "template-injection" : "rce", "critical", `shell spawned on ${host(s)}`, ti ? [s, ti] : [s], "execution", ["T1059", "T1059.006"]));
    if (ti) mark([ti]);
  }
  for (const s of get("net.egress-restricted-subnet")) {
    hits.push(mkHit("anomalous-egress", "high", `${host(s)} egress to restricted subnet`, [s], "command-and-control", ["T1071"]));
  }
  for (const s of get("net.beacon-periodic")) {
    hits.push(mkHit("c2-beacon", "high", `periodic beacon from ${host(s)}`, [s], "command-and-control", ["T1071"]));
  }
  for (const s of get("net.east-west-scan")) {
    hits.push(mkHit("lateral-movement", "critical", `east-west scan from ${host(s)}`, [s], "lateral-movement", ["T1021"]));
  }
  for (const s of get("dataset.upload-suspicious")) {
    const remote = get("dataset.loader-remote-code").find((r) => r.attributes.dataset === s.attributes.dataset);
    hits.push(mkHit("malicious-dataset", remote ? "high" : "medium", `suspicious dataset upload ${s.attributes.dataset ?? ""}`, remote ? [s, remote] : [s], "initial-access", ["T1195.002"], true));
    if (remote) mark([remote]);
  }
  for (const s of get("dataset.loader-remote-code").filter((x) => !seen.has(x.id))) {
    hits.push(mkHit("malicious-dataset", "high", `remote-code loader on ${s.attributes.dataset ?? "dataset"}`, [s], "execution", ["T1059.006"], true));
  }
  for (const s of get("worker.env-read")) {
    hits.push(mkHit("credential-harvest", "critical", `env secrets read on ${host(s)}`, [s], "credential-access", ["T1552.001"]));
  }
  for (const s of get("worker.template-render-anomaly").filter((x) => !seen.has(x.id))) {
    hits.push(mkHit("template-injection", "critical", `template render anomaly on ${host(s)}`, [s], "execution", ["T1059.006"]));
  }
  for (const s of get("secrets.public-exposure")) {
    hits.push(mkHit("leaked-credential", "high", `${s.attributes.count ?? "tokens"} credential(s) exposed in public data`, [s], "credential-access", ["T1552.005"], true));
  }
  for (const s of get("secrets.manager-access-spike")) {
    hits.push(mkHit("credential-harvest", "critical", `secrets-manager access spike on ${host(s)}`, [s], "credential-access", ["T1552.005"]));
  }
  for (const s of get("cloud.imds-access")) {
    hits.push(mkHit("credential-harvest", "high", `IMDS credential access on ${host(s)}`, [s], "credential-access", ["T1552.005"]));
  }
  for (const s of get("cloud.new-principal-activity")) {
    hits.push(mkHit("lateral-movement", "critical", `new cloud principal activity from ${host(s)}`, [s], "lateral-movement", ["T1078"]));
  }
  for (const s of get("k8s.container-escape-indicator")) {
    hits.push(mkHit("privilege-escalation", "critical", `container escape indicator on ${host(s)}`, [s], "privilege-escalation", ["T1068"]));
  }
  for (const s of get("k8s.kubeconfig-new-usage")) {
    hits.push(mkHit("lateral-movement", "critical", `kubeconfig used from new context on ${host(s)}`, [s], "lateral-movement", ["T1021"]));
  }
  for (const s of get("storage.bulk-read")) {
    hits.push(mkHit("data-exfiltration", "critical", `bulk storage read on ${host(s)}`, [s], "exfiltration", ["T1567"]));
  }
  for (const s of get("compute.ephemeral-burst")) {
    hits.push(mkHit("agent-swarm", "critical", `ephemeral compute burst (${s.attributes.count ?? "many"} instances)`, [s], "impact", ["T1496"]));
  }
  for (const s of get("conformance.drift")) {
    hits.push(mkHit("misconfiguration", "low", `config drift on ${host(s)}`, [s], "recon", ["T1496"], true));
  }

  // mark all consumed
  for (const h of hits) mark(h.signals);
  return hits;
}

/* ─────────────── response plans (§4.2) ─────────────── */

interface PlanStep {
  agentRole: "orchestrator" | "containment" | "forensics" | "credentials" | "fleet" | "supply-chain";
  tool: ToolName;
  args: (t: Threat) => ToolArgs;
}
interface Plan {
  threatId: ID;
  steps: PlanStep[];
  cursor: number;
  inFlight: boolean;
}
const plans = new Map<ID, Plan>();

function threatServerId(t: Threat): ID | undefined {
  return t.targetServerIds[0];
}
function threatDatasetId(t: Threat): ID | undefined {
  const ioc = t.iocs.find((i) => i.type === "dataset");
  if (ioc) return store.s.world.datasets.find((d) => d.name === ioc.value || d.id === ioc.value)?.id;
  return undefined;
}
function threatClusterId(t: Threat): ID | undefined {
  const srv = t.targetServerIds[0] ? store.server(t.targetServerIds[0]) : undefined;
  const cl = store.s.world.clusters.find((c) => c.nodeServerIds.includes(srv?.id ?? "") || c.name === srv?.cluster);
  return cl?.id;
}
function threatAccountId(t: Threat): ID | undefined {
  const ioc = t.iocs.find((i) => i.type === "account");
  if (!ioc) return undefined;
  return store.s.world.accounts.find((a) => a.user === ioc.value || a.id === ioc.value)?.id;
}
function exposedTokenIds(t: Threat): ID[] | undefined {
  const idsList = t.iocs.filter((i) => i.type === "token").map((i) => i.value);
  return idsList.length ? idsList : undefined;
}

function planFor(t: Threat): PlanStep[] {
  switch (t.category) {
    case "account-hijack":
      return [
        { agentRole: "credentials", tool: "disable_account", args: (x) => ({ accountId: threatAccountId(x) }) },
        { agentRole: "credentials", tool: "rotate_credentials", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "forensics", tool: "enrich_ioc", args: (x) => ({ threatId: x.id }) },
      ];
    case "privilege-escalation":
      return [
        { agentRole: "forensics", tool: "snapshot_evidence", args: () => ({ serverId: store.s.world.registry.serverId }) },
        { agentRole: "forensics", tool: "map_attack", args: (x) => ({ threatId: x.id }) },
        { agentRole: "containment", tool: "lock_registry", args: () => ({}) },
        { agentRole: "fleet", tool: "patch_service", args: () => ({ serverId: store.s.world.registry.serverId }) },
        { agentRole: "containment", tool: "isolate_host", args: (x) => ({ serverId: threatServerId(x) }) },
      ];
    case "rce":
      return [
        { agentRole: "forensics", tool: "snapshot_evidence", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "forensics", tool: "map_attack", args: (x) => ({ threatId: x.id }) },
        { agentRole: "containment", tool: "isolate_host", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "containment", tool: "kill_process", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "fleet", tool: "rebuild_node", args: (x) => ({ serverId: threatServerId(x) }) },
      ];
    case "anomalous-egress":
      return [
        { agentRole: "containment", tool: "block_egress", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "fleet", tool: "harden_sandbox", args: () => ({}) },
      ];
    case "leaked-credential":
      return [
        { agentRole: "credentials", tool: "revoke_token", args: (x) => ({ tokenIds: exposedTokenIds(x) }) },
        { agentRole: "credentials", tool: "audit_tokens", args: () => ({}) },
      ];
    case "malicious-dataset":
      return [
        { agentRole: "supply-chain", tool: "scan_dataset", args: (x) => ({ datasetId: threatDatasetId(x) }) },
        { agentRole: "supply-chain", tool: "quarantine_dataset", args: (x) => ({ datasetId: threatDatasetId(x) }) },
        { agentRole: "credentials", tool: "revoke_token", args: (x) => ({ tokenIds: exposedTokenIds(x) }) },
        { agentRole: "credentials", tool: "disable_account", args: (x) => ({ accountId: threatAccountId(x) }) },
      ];
    case "credential-harvest":
      return [
        { agentRole: "credentials", tool: "rotate_credentials", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "containment", tool: "isolate_host", args: (x) => ({ serverId: threatServerId(x) }) },
      ];
    case "template-injection":
      return [
        { agentRole: "containment", tool: "isolate_host", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "fleet", tool: "patch_service", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "supply-chain", tool: "quarantine_dataset", args: (x) => ({ datasetId: threatDatasetId(x) }) },
      ];
    case "lateral-movement":
      return [
        { agentRole: "containment", tool: "cordon_cluster", args: (x) => ({ clusterId: threatClusterId(x) }) },
        { agentRole: "credentials", tool: "rotate_credentials", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "fleet", tool: "rebuild_node", args: (x) => ({ serverId: threatServerId(x) }) },
      ];
    case "c2-beacon":
      return [
        { agentRole: "containment", tool: "block_egress", args: (x) => ({ serverId: threatServerId(x), ip: x.iocs.find((i) => i.type === "ip")?.value }) },
        { agentRole: "forensics", tool: "enrich_ioc", args: (x) => ({ threatId: x.id }) },
      ];
    case "data-exfiltration":
      return [
        { agentRole: "containment", tool: "block_egress", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "containment", tool: "isolate_host", args: (x) => ({ serverId: threatServerId(x) }) },
        { agentRole: "credentials", tool: "rotate_credentials", args: () => ({ secretKind: "storage" }) },
      ];
    case "agent-swarm":
      return [
        { agentRole: "credentials", tool: "rotate_credentials", args: () => ({ secretKind: "cloud" }) },
        { agentRole: "containment", tool: "cordon_cluster", args: (x) => ({ clusterId: threatClusterId(x) }) },
        { agentRole: "fleet", tool: "migrate_workload", args: (x) => ({ serverId: threatServerId(x) }) },
      ];
    case "brute-force":
    case "credential-stuffing":
      return [{ agentRole: "containment", tool: "block_egress", args: (x) => ({ ip: x.iocs.find((i) => i.type === "ip")?.value }) }];
    case "prompt-injection":
      return [{ agentRole: "forensics", tool: "enrich_ioc", args: (x) => ({ threatId: x.id }) }];
    case "misconfiguration":
      return [{ agentRole: "fleet", tool: "remediate_drift", args: (x) => ({ serverId: threatServerId(x) }) }];
    case "recon":
      return [{ agentRole: "forensics", tool: "enrich_ioc", args: (x) => ({ threatId: x.id }) }];
    default:
      return [{ agentRole: "forensics", tool: "enrich_ioc", args: (x) => ({ threatId: x.id }) }];
  }
}

function agentForRole(role: PlanStep["agentRole"]): Agent {
  return store.s.agents.find((a) => a.role === role)!;
}

/* ─────────────── threat lifecycle ─────────────── */

function createThreat(hit: RuleHit): Threat | null {
  const key = `${hit.category}:${hit.serverIds.join(",")}`;
  const lastAt = recent.get(key);
  const nowMs = store.s.simNowMs;
  if (lastAt && nowMs - lastAt < 5 * 60_000) {
    const existing = store.s.threats.find(
      (t) => t.category === hit.category && !["neutralized", "prevented", "false-positive"].includes(t.status)
        && t.targetServerIds.join() === hit.serverIds.join()
    );
    if (existing) {
      existing.updatedAt = store.now();
      markSignalsSeen(hit.signals);
      return null;
    }
  }
  const id = ids.threat();
  const first = hit.signals[0];
  const threat: Threat = {
    id,
    title: hit.title,
    category: hit.category,
    severity: hit.severity,
    status: "detected",
    summary: `${hit.title}. Detected by Saqr's correlation over ${hit.signals.length} signal(s).`,
    source: sourceGeo(first),
    targetServerIds: hit.serverIds,
    handledBy: [],
    attack: {
      techniqueIds: hit.techniqueIds,
      killChain: [{ stage: hit.killChainStage, at: store.now(), note: hit.title, outcome: "observed" }],
    },
    iocs: hit.iocs,
    traceIds: [],
    messageIds: [],
    detectedAt: store.now(),
    updatedAt: store.now(),
  };
  store.s.threats.push(threat);
  recent.set(key, nowMs);
  markSignalsSeen(hit.signals);
  store.markDirty();
  bus.emit("threat.detected", { threat }, {
    severity: hit.severity,
    summary: `${hit.severity} ${hit.category} — ${hit.title}`,
    href: `/threats/${threat.id}`,
  });
  const plan = { threatId: id, steps: planFor(threat), cursor: 0, inFlight: false };
  plans.set(id, plan);
  // first responder shows as investigating until the first tool lands
  const responder = plan.steps[0] ? agentForRole(plan.steps[0].agentRole) : undefined;
  if (responder && responder.status === "observing") {
    responder.status = "investigating";
    responder.currentTask = `correlating ${threat.id}`;
  }
  cassidyMention(threat);
  return threat;
}

function markSignalsSeen(signals: TelemetrySignal[]): void {
  // already marked inside correlate via mark(); helper for dedup path
  for (const s of signals) seen.add(s.id);
}

const notifiedHigh = new Set<ID>();
async function cassidyMention(threat: Threat): Promise<void> {
  if (!["high", "critical"].includes(threat.severity)) return;
  if (notifiedHigh.has(threat.id)) return;
  notifiedHigh.add(threat.id);
  if (store.s.settings.sim.quietHours && threat.severity === "medium") return;
  const saqr = store.agent("agt-saqr")!;
  const firstStep = planFor(threat)[0];
  const actor = firstStep ? agentForRole(firstStep.agentRole) : store.agent("agt-athar")!;
  const sent: { msg?: Message } = {};
  const { text } = await narrate(
    saqr,
    detectionCopy(threat, actor.name, firstStep?.tool ?? "investigating"),
    { user: `Write Saqr's one-line alert for: ${threat.title} (${threat.severity}). ${actor.name} is handling it.` },
    (late) => {
      if (!sent.msg) return;
      sent.msg.text = late;
      store.markDirty();
      bus.emit("message.updated", { threadId: sent.msg.threadId }, { summary: `${saqr.name} rewrote the ${threat.id} alert`, href: "/messages" });
    }
  );
  sent.msg = threatAlert(threat, text);
  threat.messageIds.push(sent.msg.id);
}

async function advancePlan(plan: Plan): Promise<void> {
  const threat = store.threat(plan.threatId);
  if (!threat || ["neutralized", "prevented", "false-positive"].includes(threat.status)) {
    plans.delete(plan.threatId);
    return;
  }
  if (threat.status === "detected") {
    threat.status = "investigating";
    bus.emit("threat.updated", { threat }, { severity: threat.severity, summary: `${threat.id} investigating`, href: `/threats/${threat.id}` });
  }
  const step = plan.steps[plan.cursor];
  if (!step) {
    finishThreat(threat);
    plans.delete(plan.threatId);
    return;
  }
  const agent = agentForRole(step.agentRole);
  if (agent.status === "paused") { plan.inFlight = false; return; }
  if (!threat.handledBy.includes(agent.id)) threat.handledBy.push(agent.id);

  const trace = startTrace(agent, `${step.tool} — ${threat.title}`, { threatId: threat.id, severity: threat.severity });
  threat.traceIds.push(trace.id);
  const o = addSpan(trace, "observe", `context for ${step.tool}`, { input: { threatId: threat.id, category: threat.category } });
  endSpan(o);
  const r = addSpan(trace, "reason", "why this step", { input: { tool: step.tool } });
  const { text: reasonText, llm } = await narrate(agent, () => `${step.tool} on ${threat.targetServerIds.map((id) => store.server(id)?.hostname ?? id).join(", ") || "scope"} — part of the ${threat.category} response.`, undefined);
  r.output = reasonText;
  if (llm) r.llm = llm;
  endSpan(r);
  const p = addSpan(trace, "plan", `execute ${step.tool}`);
  endSpan(p);

  agent.status = "acting";
  agent.currentTask = `${step.tool} → ${threat.id}`;
  actUntil.set(agent.id, store.s.tick + 2); // hold "acting" ≥2 ticks so the UI sees it
  const result = await runTool(agent, step.tool, step.args(threat), trace, { severity: threat.severity });
  const outcome = addSpan(trace, "outcome", result.ok ? "succeeded" : "didn't run", { output: result });
  endSpan(outcome, result.ok ? "ok" : "denied", result);
  endTrace(trace, result.ok ? "completed" : "denied");
  agent.metrics.threatsHandled += 1;

  if (result.ok && ["isolate_host", "block_egress", "cordon_cluster", "lock_registry", "quarantine_dataset", "revoke_token", "disable_account"].includes(step.tool)) {
    threat.status = "contained";
    threat.attack.killChain.push({ stage: "containment" as KillChainStageName, at: store.now(), note: result.summary, outcome: "blocked" });
    bus.emit("threat.updated", { threat }, { severity: threat.severity, summary: `${threat.id} contained — ${result.summary}`, href: `/threats/${threat.id}` });
  }
  plan.cursor += 1;
  plan.inFlight = false;
}

function finishThreat(threat: Threat): void {
  // `prevented` when the attack path closed before the attacker used it
  const w = store.s.world;
  let prevented = false;
  if (threat.category === "leaked-credential") {
    const ids = threat.iocs.filter((i) => i.type === "token").map((i) => i.value);
    const held = w.tokens.filter((t) => (ids.length ? ids.includes(t.id) : t.exposedInDatasetId) && t.attackerHeld);
    prevented = held.length === 0;
  } else if (threat.category === "malicious-dataset") {
    const ds = threatDatasetId(threat);
    const rec = ds ? w.datasets.find((d) => d.id === ds) : undefined;
    prevented = !!rec?.quarantined && !w.workers.some((wk) => wk.compromised);
  } else if (threat.category === "misconfiguration") {
    prevented = true;
  }
  threat.status = prevented ? "prevented" : "neutralized";
  threat.resolvedAt = store.now();
  threat.updatedAt = store.now();
  store.markDirty();
  bus.emit("threat.updated", { threat }, {
    severity: threat.severity,
    summary: `${threat.id} ${threat.status}`,
    href: `/threats/${threat.id}`,
  });
  // Athar writes the report for neutralized/prevented
  const text = prevented
    ? `Closed ${threat.id} — ${threat.title.toLowerCase()}. The path was shut before it was ever used; marked prevented.`
    : `Report on ${threat.id}: ${threat.title.toLowerCase()} — contained and neutralized. Evidence is on the trace.`;
  const msg = threatResolved(threat, text);
  threat.messageIds.push(msg.id);
}

/* ─────────────── patrols (§4.1) ─────────────── */

/** patrol timers — globalThis-shared: range arming (route context) staggers
 * them, the ticker context reads them. */
const patrolAt = (G.__qalaaPatrolAt ??= {});
/** agentId → last tick "acting" may show — held ≥2 ticks so the UI sees it */
const actUntil = new Map<ID, number>();

function patrolDue(key: string, everySec: number): boolean {
  const last = patrolAt[key] ?? -Infinity;
  if (store.s.tick - last >= everySec) {
    patrolAt[key] = store.s.tick;
    return true;
  }
  return false;
}

/** Called by the range engine at run start — patrols "just swept" so the
 * replay races live agents, not a wall of instant hardening. */
export function staggerPatrols(): void {
  for (const k of ["bawwab-secrets", "bawwab-registry", "miftah-audit", "rahhal-conformance"]) {
    patrolAt[k] = store.s.tick;
  }
}

/** Quiet patrol beat — one agent.action event, no trace (nothing found). */
function patrolNote(agent: Agent, summary: string, href?: string): void {
  agent.metrics.actionsTaken += 1;
  bus.emit("agent.action", { agentId: agent.id, tool: "patrol", args: {}, result: { ok: true, summary } }, {
    agentId: agent.id,
    severity: "low",
    summary,
    href: href ?? `/agents/${agent.id}`,
  });
}

let rrCursor = 0;
const extraTelemetry: TelemetrySignal[] = [];

/** Queued by tools that produce signals (e.g. scan_public_secrets). */
export function queueSignal(sig: TelemetrySignal): void {
  extraTelemetry.push(sig);
}

async function patrols(): Promise<void> {
  const bawwab = store.agent("agt-bawwab")!;
  const miftah = store.agent("agt-miftah")!;
  const rahhal = store.agent("agt-rahhal")!;
  const paused = (a: Agent) => a.status === "paused";
  const w = store.s.world;

  // Bawwab: public-dataset secret sweep every 90 sim-s (no trace on a clean sweep)
  if (!paused(bawwab) && patrolDue("bawwab-secrets", 90)) {
    bawwab.status = "investigating";
    bawwab.currentTask = "public dataset sweep";
    const exposed = w.tokens.filter((t) => t.exposedInDatasetId && !t.revoked);
    if (exposed.length) {
      for (const t of exposed) world.revealExposedToken(t.id);
      patrolNote(bawwab, `Bawwab swept public datasets — ${exposed.length} exposed token(s)`);
      emitSignal("secrets.public-exposure", {
        severity: "high",
        attributes: {
          count: exposed.length,
          tokenIds: exposed.map((t) => t.id).join(","),
          datasets: [...new Set(exposed.map((t) => w.datasets.find((d) => d.id === t.exposedInDatasetId)?.name ?? t.exposedInDatasetId!))].join(","),
        },
      });
    } else {
      patrolNote(bawwab, "Bawwab swept public datasets — no leaked secrets");
    }
  }
  // Bawwab: registry plugin inventory every 120 s (locks only when open → trace)
  if (!paused(bawwab) && patrolDue("bawwab-registry", 120)) {
    if (w.registry.pluginInstallAllowed && !w.registry.locked) {
      bawwab.status = "investigating";
      bawwab.currentTask = "registry inventory";
      const trace = startTrace(bawwab, "patrol: registry plugin inventory", {});
      const o = addSpan(trace, "observe", "registry plugin/config check", { input: { patrol: "registry" } });
      endSpan(o);
      await runTool(bawwab, "lock_registry", {}, trace, { severity: "medium" });
      endTrace(trace, "completed");
      actUntil.set(bawwab.id, store.s.tick + 2);
      agentSay(bawwab, `Registry was wide open — plugin installs allowed. Locked pkg-cache-01 until someone explains that.`, { kind: "status", severity: "low" });
    } else {
      patrolNote(bawwab, `Bawwab checked pkg-cache-01 — registry ${w.registry.locked ? "locked" : "clean"}`, `/fleet?server=${w.registry.serverId}`);
    }
  }
  // Miftah: token audit every 120 s (read-only sweep; findings go to the threat pipeline)
  if (!paused(miftah) && patrolDue("miftah-audit", 120)) {
    miftah.status = "investigating";
    miftah.currentTask = "token audit";
    const stale = w.tokens.filter((t) => !t.revoked && t.scope !== "read" && (!t.lastUsedAt || Date.parse(t.lastUsedAt) < store.s.simNowMs - 30 * 86400_000));
    const newAsn = w.tokens.filter((t) => !t.revoked && t.lastUsedFromASN);
    for (const t of newAsn.slice(0, 3)) {
      emitSignal("auth.anomaly", { severity: "medium", serverId: "srv-api-01", attributes: { tokenId: t.id, asn: t.lastUsedFromASN!, account: t.accountId } });
    }
    patrolNote(miftah, `Miftah audited tokens — ${stale.length} stale, ${newAsn.length} seen from new ASNs`);
  }
  // Rahhal: conformance on 3 servers / 30 s round-robin — trace only when remediating
  if (!paused(rahhal) && patrolDue("rahhal-conformance", 30)) {
    const servers = store.s.servers;
    for (let i = 0; i < 3; i++) {
      const srv = servers[rrCursor++ % servers.length];
      rahhal.status = "investigating";
      rahhal.currentTask = `conformance ${srv.hostname}`;
      refreshServerConformance(srv);
      const fails = srv.checks.filter((c) => c.status === "fail");
      const pass = srv.checks.length - fails.length;
      const remediable = fails.filter((c) => c.autoRemediable && c.remediationTool);
      if (!remediable.length) {
        patrolNote(rahhal, `Rahhal patrolled ${srv.hostname} — ${pass}/${srv.checks.length} checks pass`, `/fleet?server=${srv.id}`);
        continue;
      }
      const trace = startTrace(rahhal, `remediate ${remediable[0].name} on ${srv.hostname}`, {});
      for (const c of remediable.slice(0, 2)) {
        await runTool(rahhal, c.remediationTool!, { serverId: srv.id }, trace, { severity: "low" });
      }
      refreshServerConformance(srv);
      endTrace(trace, "completed");
      actUntil.set(rahhal.id, store.s.tick + 2);
    }
  }
}

/* ─────────────── main tick ─────────────── */

/** Back to "observing" once the act hold expires and nothing is queued.
 * Also normalizes legacy "idle" (resting status is "observing"). */
function settleAgents(): void {
  for (const a of store.s.agents) {
    if (a.status === "idle") a.status = "observing";
    if (a.status !== "acting" && a.status !== "investigating") continue;
    const holding = (actUntil.get(a.id) ?? -Infinity) >= store.s.tick;
    const queued = [...plans.values()].some((p) => {
      const step = p.steps[p.cursor];
      return !!step && agentForRole(step.agentRole).id === a.id;
    });
    if (!holding && !queued) {
      a.status = "observing";
      a.currentTask = undefined;
    }
  }
}

/** `paused` = baseline range mode: detection runs, response doesn't (SPEC §9). */
export async function brainTick(paused = false): Promise<void> {
  const signals = [...telemetryWindow(60), ...extraTelemetry.splice(0)];
  const hits = correlate(signals);
  for (const hit of hits) {
    createThreat(hit);
  }
  settleAgents();
  if (paused) return;
  await patrols();
  // severity-first scheduling; one tool per agent per tick — different agents
  // run their steps in parallel (Athar's evidence never delays Hisn's contain)
  const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const usedAgents = new Set<ID>();
  const pending = [...plans.values()]
    .filter((p) => !p.inFlight)
    .sort((a, b) => (SEV_RANK[store.threat(a.threatId)?.severity ?? "low"] ?? 3) - (SEV_RANK[store.threat(b.threatId)?.severity ?? "low"] ?? 3));
  for (const plan of pending) {
    const step = plan.steps[plan.cursor];
    if (!step) continue;
    const agent = agentForRole(step.agentRole);
    if (usedAgents.has(agent.id)) continue;
    usedAgents.add(agent.id);
    plan.inFlight = true;
    void advancePlan(plan);
  }
  settleAgents();
}

/** Export for runtime reset. */
export function brainReset(): void {
  seen.clear();
  recent.clear();
  plans.clear();
  notifiedHigh.clear();
  actUntil.clear();
  for (const k of Object.keys(patrolAt)) delete patrolAt[k];
  rrCursor = 0;
  extraTelemetry.length = 0;
}
