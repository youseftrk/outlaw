/**
 * Qalaa — shared domain contract.
 *
 * Consumed by the UI (client) and the backend (server/**, app/api/**).
 * Append-only: add fields/types, do not rename or remove without touching both sides.
 */

export type ID = string;
export type ISODate = string;

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];

export type Region =
  | "us-east"
  | "us-west"
  | "eu-west"
  | "eu-central"
  | "ap-south"
  | "ap-northeast"
  | "sa-east"
  | "me-central";

export type Provider = "aws" | "gcp" | "azure" | "hetzner" | "on-prem";
export type Environment = "prod" | "staging" | "research" | "sandbox";

export interface GeoPoint {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
}

/* ─────────────────────────── Fleet ─────────────────────────── */

export type ServerRole =
  | "api"
  | "web"
  | "worker"
  | "inference"
  | "registry"
  | "database"
  | "storage"
  | "bastion"
  | "ci"
  | "k8s-node"
  | "control-plane"
  | "vpn"
  | "scm";

export type ServerStatus =
  | "healthy"
  | "degraded"
  | "isolated"
  | "compromised"
  | "migrating"
  | "rebuilding"
  | "offline";

export type ConformanceCategory =
  | "patching"
  | "network"
  | "identity"
  | "config"
  | "runtime"
  | "data";

export interface ConformanceCheck {
  id: ID;
  name: string;
  category: ConformanceCategory;
  status: "pass" | "warn" | "fail";
  detail: string;
  checkedAt: ISODate;
  autoRemediable: boolean;
  remediationTool?: ToolName;
}

/** which fleet adapter executes tools on this server; `sim` (default) mutates the world model, `ssh` reaches a real host */
export type ServerAdapterKind = "sim" | "ssh";

export interface Server {
  id: ID;
  hostname: string;
  adapter?: ServerAdapterKind;
  /** reachable `host[:port]` for the ssh adapter (mirrors `hostMap[id]`); unset → the host is unreachable */
  sshTarget?: string;
  role: ServerRole;
  provider: Provider;
  region: Region;
  env: Environment;
  geo: GeoPoint;
  ip: string;
  os: string;
  kernel: string;
  cluster?: string;
  tags: string[];
  workloads: string[];
  status: ServerStatus;
  /** 0–100 */
  conformanceScore: number;
  checks: ConformanceCheck[];
  /** agent ids */
  protectedBy: ID[];
  lastSeen: ISODate;
  createdAt: ISODate;
  /** rolling cpu/net signal for sparklines, newest last, 0–100 */
  load: number[];
}

export type MigrationReason =
  | "capacity"
  | "security"
  | "cost"
  | "compliance"
  | "incident-response"
  | "decommission";

export type MigrationStatus =
  | "planned"
  | "awaiting-approval"
  | "dry-run"
  | "executing"
  | "verifying"
  | "completed"
  | "rolled-back"
  | "failed";

export interface MigrationStep {
  id: ID;
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  startedAt?: ISODate;
  finishedAt?: ISODate;
  log: string[];
}

export interface Migration {
  id: ID;
  title: string;
  reason: MigrationReason;
  sourceServerId: ID;
  targetServerId?: ID;
  targetSpec?: { provider: Provider; region: Region; role: ServerRole };
  workloads: string[];
  status: MigrationStatus;
  steps: MigrationStep[];
  ownerAgentId: ID;
  approvalId?: ID;
  traceIds: ID[];
  /** 0–100 */
  progress: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ─────────────────────────── Threats ─────────────────────────── */

export type ThreatCategory =
  | "recon"
  | "account-hijack"
  | "brute-force"
  | "credential-stuffing"
  | "leaked-credential"
  | "zero-day-exploit"
  | "malicious-dataset"
  | "template-injection"
  | "rce"
  | "privilege-escalation"
  | "credential-harvest"
  | "lateral-movement"
  | "c2-beacon"
  | "data-exfiltration"
  | "supply-chain"
  | "prompt-injection"
  | "agent-swarm"
  | "anomalous-egress"
  | "misconfiguration";

export type ThreatStatus =
  | "detected"
  | "investigating"
  | "contained"
  | "neutralized"
  | "prevented"
  | "escalated"
  | "false-positive";

export type KillChainStageName =
  | "recon"
  | "initial-access"
  | "execution"
  | "persistence"
  | "privilege-escalation"
  | "credential-access"
  | "lateral-movement"
  | "command-and-control"
  | "exfiltration"
  | "impact";

export interface KillChainStage {
  stage: KillChainStageName;
  at: ISODate;
  note: string;
  outcome: "observed" | "blocked" | "prevented";
}

export type IOCType =
  | "ip"
  | "domain"
  | "url"
  | "hash"
  | "token"
  | "email"
  | "dataset"
  | "package"
  | "cve"
  | "user-agent"
  | "account";

export interface IOC {
  type: IOCType;
  value: string;
  /** 0–1 */
  confidence: number;
  firstSeen: ISODate;
  tags: string[];
}

export interface Threat {
  id: ID;
  title: string;
  category: ThreatCategory;
  severity: Severity;
  status: ThreatStatus;
  summary: string;
  source: { ip?: string; geo?: GeoPoint; actorLabel?: string; userAgent?: string };
  targetServerIds: ID[];
  /** agent ids */
  handledBy: ID[];
  attack: { techniqueIds: string[]; killChain: KillChainStage[] };
  iocs: IOC[];
  traceIds: ID[];
  messageIds: ID[];
  detectedAt: ISODate;
  updatedAt: ISODate;
  resolvedAt?: ISODate;
  /** operator-only linkage for scoring; never included in agent context */
  rangeRunId?: ID;
  rangeStepId?: ID;
}

/* ─────────────────────────── Agents ─────────────────────────── */

export type AgentRole =
  | "orchestrator"
  | "containment"
  | "forensics"
  | "credentials"
  | "fleet"
  | "supply-chain";

export type AgentStatus =
  | "idle"
  | "observing"
  | "investigating"
  | "acting"
  | "awaiting-approval"
  | "paused";

export type Autonomy = "observe" | "recommend" | "act-with-approval" | "autonomous";

export type ToolRisk = "read" | "low" | "medium" | "high" | "destructive";

export type ToolName =
  | "query_telemetry"
  | "scan_public_secrets"
  | "audit_tokens"
  | "revoke_token"
  | "rotate_credentials"
  | "disable_account"
  | "scan_dataset"
  | "quarantine_dataset"
  | "inspect_worker"
  | "isolate_host"
  | "block_egress"
  | "cordon_cluster"
  | "lock_registry"
  | "patch_service"
  | "harden_sandbox"
  | "kill_process"
  | "rebuild_node"
  | "snapshot_evidence"
  | "enrich_ioc"
  | "map_attack"
  | "run_conformance"
  | "remediate_drift"
  | "migrate_workload"
  | "notify_human"
  | "request_approval";

export type ToolTarget =
  | "server"
  | "cluster"
  | "token"
  | "account"
  | "dataset"
  | "ioc"
  | "workload"
  | "subnet"
  | "none";

export interface ToolSpec {
  name: ToolName;
  label: string;
  description: string;
  risk: ToolRisk;
  targets: ToolTarget[];
}

export interface AgentMetrics {
  threatsHandled: number;
  actionsTaken: number;
  approvalsRequested: number;
  messagesSent: number;
  policyDenials: number;
  avgTimeToDetectSec: number;
  avgTimeToContainSec: number;
}

export interface Agent {
  id: ID;
  /** Cassidy, Sundance, Doc, Belle, Ringo, Calamity */
  name: string;
  callsign: string;
  role: AgentRole;
  mandate: string;
  description: string;
  status: AgentStatus;
  autonomy: Autonomy;
  /** 1–5 */
  trustLevel: number;
  tools: ToolName[];
  assignedServerIds: ID[];
  metrics: AgentMetrics;
  currentTask?: string;
  heartbeatAt: ISODate;
  createdAt: ISODate;
  /** rolling activity for sparklines, newest last */
  activity: number[];
}

/* ─────────────────────────── Governance ─────────────────────────── */

export type PolicyEffect = "allow" | "deny" | "require-approval";

export interface PolicyMatch {
  tools?: ToolName[];
  risk?: ToolRisk[];
  minSeverity?: Severity;
  serverTags?: string[];
  environments?: Environment[];
  agentRoles?: AgentRole[];
  /** e.g. "weekend", "after-hours" */
  timeWindow?: "any" | "business-hours" | "after-hours" | "weekend";
}

export interface Policy {
  id: ID;
  name: string;
  description: string;
  effect: PolicyEffect;
  enabled: boolean;
  /** lower evaluates first */
  priority: number;
  match: PolicyMatch;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** how many times this policy decided an action */
  hits: number;
}

export interface PolicyEvaluation {
  policyId: ID;
  policyName: string;
  effect: PolicyEffect;
  matched: boolean;
  reason: string;
}

export type TraceSpanKind =
  | "observe"
  | "reason"
  | "plan"
  | "policy"
  | "approval"
  | "tool"
  | "outcome"
  | "message";

export interface LLMUsage {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  /** true when the deterministic engine produced the text instead of the LLM */
  fallback: boolean;
}

export interface TraceSpan {
  id: ID;
  kind: TraceSpanKind;
  label: string;
  startedAt: ISODate;
  endedAt?: ISODate;
  status: "ok" | "denied" | "error" | "pending";
  input?: unknown;
  output?: unknown;
  toolName?: ToolName;
  policyEvaluations?: PolicyEvaluation[];
  approvalId?: ID;
  llm?: LLMUsage;
}

export type TraceVerdict =
  | "in-progress"
  | "completed"
  | "denied"
  | "awaiting-approval"
  | "failed";

export interface Trace {
  id: ID;
  agentId: ID;
  threatId?: ID;
  migrationId?: ID;
  intent: string;
  spans: TraceSpan[];
  verdict: TraceVerdict;
  /** 0–100 */
  riskScore: number;
  startedAt: ISODate;
  endedAt?: ISODate;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface Approval {
  id: ID;
  traceId: ID;
  agentId: ID;
  toolName: ToolName;
  summary: string;
  risk: ToolRisk;
  targets: string[];
  status: ApprovalStatus;
  requestedAt: ISODate;
  decidedAt?: ISODate;
  decidedBy?: "operator" | "message" | "auto-policy";
  threatId?: ID;
  migrationId?: ID;
}

/* ─────────────────────────── Messaging ─────────────────────────── */

export interface Thread {
  id: ID;
  agentId: ID;
  title: string;
  lastMessageAt: ISODate;
  lastPreview: string;
  unread: number;
  pinned: boolean;
}

export type MessageKind =
  | "text"
  | "alert"
  | "approval-request"
  | "report"
  | "status"
  | "system";

export type Tapback = "heart" | "thumbs-up" | "thumbs-down" | "haha" | "!!" | "?";

export interface Attachment {
  type: "threat-card" | "server-card" | "trace-link" | "migration-card" | "range-card";
  refId: ID;
  title: string;
  subtitle?: string;
}

export interface QuickReply {
  label: string;
  /** operator command text sent back when tapped, e.g. "approve A-1042" */
  command: string;
  tone?: "primary" | "danger" | "neutral";
}

export type DeliveryStatus = "queued" | "sent" | "failed";

/** Outcome of pushing a message to an outbound channel (webhook / slack / twilio). */
export interface MessageDelivery {
  channel: string;
  status: DeliveryStatus;
  at: ISODate;
  error?: string;
}

export interface Message {
  id: ID;
  threadId: ID;
  from: "agent" | "operator" | "system";
  agentId?: ID;
  kind: MessageKind;
  text: string;
  severity?: Severity;
  attachments?: Attachment[];
  quickReplies?: QuickReply[];
  approvalId?: ID;
  threatId?: ID;
  traceId?: ID;
  sentAt: ISODate;
  /** set immediately for in-app messages; for channel-delivered messages only once the channel confirms */
  deliveredAt?: ISODate;
  readAt?: ISODate;
  tapback?: Tapback;
  delivery?: MessageDelivery[];
}

/* ─────────────────────────── Research ─────────────────────────── */

export interface CVE {
  id: string;
  title: string;
  cvss: number;
  severity: Severity;
  published: ISODate;
  affected: string[];
  summary: string;
  techniqueIds: string[];
  patched: boolean;
}

export interface AttackTechnique {
  id: string;
  name: string;
  tactic: KillChainStageName;
  description: string;
  url: string;
}

export interface ThreatActor {
  id: ID;
  name: string;
  aliases: string[];
  description: string;
  techniqueIds: string[];
  motivation: string;
}

export interface ResearchFinding {
  label: string;
  detail: string;
  severity?: Severity;
}

export interface ResearchResult {
  summary: string;
  findings: ResearchFinding[];
  relatedThreatIds: ID[];
  iocs: IOC[];
  cves: CVE[];
  techniques: AttackTechnique[];
  actors: ThreatActor[];
}

export type ResearchKind = "ioc" | "cve" | "technique" | "actor" | "freeform";

export interface ResearchQuery {
  id: ID;
  query: string;
  kind: ResearchKind;
  agentId: ID;
  traceId?: ID;
  status: "running" | "completed" | "failed";
  askedAt: ISODate;
  completedAt?: ISODate;
  result?: ResearchResult;
}

/* ─────────────────────────── Insights ─────────────────────────── */

export type InsightsWindow = "24h" | "7d" | "30d";

export interface InsightsSummary {
  window: InsightsWindow;
  protectedServers: number;
  protectedWorkloads: number;
  threatsDetected: number;
  threatsNeutralized: number;
  threatsPrevented: number;
  credentialsRotated: number;
  tokensRevoked: number;
  datasetsQuarantined: number;
  approvalsPending: number;
  avgTimeToDetectSec: number;
  avgTimeToContainSec: number;
  uptimePct: number;
  byCategory: { category: ThreatCategory; count: number }[];
  bySeverity: { severity: Severity; count: number }[];
  timeline: { t: ISODate; detected: number; neutralized: number; prevented: number }[];
  byAgent: { agentId: ID; handled: number; actions: number; denials: number; messages: number }[];
  topProtected: { serverId: ID; threatsBlocked: number }[];
  fleetConformanceAvg: number;
}

/* ─────────────────────────── Range (blind cyber range) ─────────────────────────── */
/**
 * The range replays a real-world kill chain against the simulated environment.
 * Range internals (steps, timings, preconditions) are OPERATOR-ONLY. Agents receive
 * telemetry only and must detect + stop the chain on their own.
 */

export type RangeMode = "protected" | "baseline";
export type RangeRunStatus = "idle" | "running" | "paused" | "completed" | "aborted";
export type RangeStepStatus = "pending" | "active" | "succeeded" | "blocked" | "skipped";

export interface RangeStep {
  id: ID;
  order: number;
  /** offset from run start at speed 1× */
  offsetMs: number;
  /** real-world timestamp label, e.g. "Jul 10 · 09:41 UTC" */
  realWorldLabel: string;
  stage: KillChainStageName;
  title: string;
  description: string;
  /** human-readable preconditions on world state that must hold for the step to succeed */
  requires: string[];
  /** human-readable effects applied on success */
  effects: string[];
  techniqueIds: string[];
  /** which agent tools can neutralise the preconditions (operator-only hint) */
  counters: ToolName[];
}

export interface RangeScenario {
  id: ID;
  name: string;
  basedOn: string;
  description: string;
  sources: { label: string; url: string }[];
  baseline: {
    detectedAfterLabel: string;
    disclosedAfterLabel: string;
    infraRebuiltPct: number;
    credentialsHarvested: number;
    datasetsAccessed: number;
  };
  /** default total wall-clock duration at 1× */
  durationMs: number;
  steps: RangeStep[];
}

export interface RangeStepResult {
  stepId: ID;
  status: RangeStepStatus;
  at?: ISODate;
  blockedBy?: { agentId: ID; toolName: ToolName; traceId: ID; note: string };
  threatId?: ID;
}

export interface RangeScore {
  detectedAtMs?: number;
  containedAtMs?: number;
  stagesTotal: number;
  stagesBlocked: number;
  stagesSucceeded: number;
  credentialsHarvested: number;
  datasetsAccessed: number;
  nodesCompromised: number;
  serversIsolated: number;
  approvalsRequested: number;
  falsePositives: number;
  grade: "S" | "A" | "B" | "C" | "D" | "F";
  vsBaseline: { detectionSpeedupLabel: string; blastRadiusReductionPct: number };
}

export interface RangeRun {
  id: ID;
  scenarioId: ID;
  mode: RangeMode;
  status: RangeRunStatus;
  speed: number;
  startedAt: ISODate;
  finishedAt?: ISODate;
  /** ms elapsed on the scenario clock */
  clockMs: number;
  currentStepIndex: number;
  stepResults: RangeStepResult[];
  score?: RangeScore;
  /** operator-only narration of what the attacker is doing right now */
  attackerLog: { at: ISODate; text: string }[];
}

/* ─────────────────────────── Events (SSE) ─────────────────────────── */

export type EventType =
  | "telemetry"
  | "threat.detected"
  | "threat.updated"
  | "agent.status"
  | "agent.action"
  | "trace.started"
  | "trace.span"
  | "trace.completed"
  | "approval.requested"
  | "approval.decided"
  | "message.sent"
  | "message.updated"
  | "server.updated"
  | "migration.updated"
  | "policy.updated"
  | "research.updated"
  | "range.step"
  | "range.run"
  | "insights.updated"
  | "system";

export interface QalaaEvent<T = unknown> {
  id: ID;
  type: EventType;
  at: ISODate;
  agentId?: ID;
  severity?: Severity;
  /** one-line human description for live feeds, e.g. "Sundance isolated dataset-worker-02" */
  summary?: string;
  /** optional deep link target, e.g. "/threats/T-1042" */
  href?: string;
  payload: T;
}

export interface TelemetrySignal {
  id: ID;
  at: ISODate;
  serverId?: ID;
  cluster?: string;
  /** generic signal names — never scenario names */
  signal:
    | "auth.anomaly"
    | "auth.admin-token-minted"
    | "auth.geo-anomaly"
    | "api.enumeration-burst"
    | "process.new-listener"
    | "process.shell-spawn"
    | "process.plugin-install"
    | "net.egress-restricted-subnet"
    | "net.beacon-periodic"
    | "net.east-west-scan"
    | "dataset.upload-suspicious"
    | "dataset.loader-remote-code"
    | "worker.env-read"
    | "worker.template-render-anomaly"
    | "secrets.public-exposure"
    | "secrets.manager-access-spike"
    | "cloud.imds-access"
    | "cloud.new-principal-activity"
    | "k8s.container-escape-indicator"
    | "k8s.kubeconfig-new-usage"
    | "storage.bulk-read"
    | "compute.ephemeral-burst"
    | "inference.prompt-injection"
    | "conformance.drift";
  severity: Severity;
  attributes: Record<string, string | number | boolean>;
}

/* ─────────────────────────── Settings ─────────────────────────── */

export type LLMProvider =
  | "none"
  | "groq"
  | "gemini"
  | "mistral"
  | "cerebras"
  | "openrouter"
  | "huggingface"
  | "custom";

export interface LLMSettings {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  enabled: boolean;
  /** key is stored server-side only; the client only learns whether one is set */
  apiKeySet: boolean;
  lastTest?: { ok: boolean; at: ISODate; latencyMs?: number; error?: string; sample?: string };
}

export type SshHostKeyPolicy = "strict" | "accept-new";

/** Redacted view of the SshAdapterConfig kept in .data/secrets.json — key material never leaves the server. */
export interface SshSettings {
  user: string;
  port: number;
  hostKeyPolicy: SshHostKeyPolicy;
  sudo: boolean;
  timeoutMs: number;
  /** a private key is stored for `keyRef` */
  keySet: boolean;
  bastion?: { host: string; port: number; user: string; keySet: boolean };
  /** serverId → reachable host[:port] */
  hostMap: Record<ID, string>;
  /** pinned host keys (strict / accept-new) */
  knownHostsCount: number;
  orchestratorUrl?: string;
  lastTest?: { ok: boolean; at: ISODate; serverId?: ID; latencyMs?: number; error?: string; sample?: string };
}

/** PATCH /api/settings `ssh` body. Keys are write-only ("" clears); `bastion: null` / `orchestratorUrl: null` remove. */
export interface SshSettingsPatch {
  user?: string;
  port?: number;
  hostKeyPolicy?: SshHostKeyPolicy;
  sudo?: boolean;
  timeoutMs?: number;
  privateKey?: string;
  bastion?: { host?: string; port?: number; user?: string; privateKey?: string } | null;
  hostMap?: Record<ID, string>;
  orchestratorUrl?: string | null;
  /** drop every pinned host key (e.g. after a legitimate host re-key) */
  forgetKnownHosts?: boolean;
}

export type DeliveryChannel = "off" | "webhook" | "slack" | "twilio";

/** Which agent/system messages leave the app. Empty `kinds` / `agentIds` = no restriction. */
export interface DeliveryFilter {
  minSeverity: Severity;
  kinds: MessageKind[];
  agentIds: ID[];
}

export interface DeliverySettings {
  channel: DeliveryChannel;
  /** generic webhook or Slack incoming-webhook URL */
  url: string;
  twilio: { accountSid: string; from: string; to: string };
  filter: DeliveryFilter;
  /** HMAC / inbound shared secret is stored server-side only */
  secretSet: boolean;
  twilioAuthTokenSet: boolean;
  lastTest?: { ok: boolean; at: ISODate; channel: DeliveryChannel; latencyMs?: number; error?: string };
}

export type AuthSource = "settings" | "env" | "off";

export interface AuthSettings {
  enabled: boolean;
  /** where the password comes from; "off" = no login required */
  source: AuthSource;
}

export interface Settings {
  llm: LLMSettings;
  ssh: SshSettings;
  operator: { name: string; phone: string; org: string };
  sim: { speed: number; autoRun: boolean; quietHours: boolean };
  delivery: DeliverySettings;
  /** computed server-side from env + secrets; not persisted in state */
  auth?: AuthSettings;
}

/* ─────────────────────────── API envelopes ─────────────────────────── */

export interface Bootstrap {
  agents: Agent[];
  servers: Server[];
  threats: Threat[];
  approvals: Approval[];
  threads: Thread[];
  policies: Policy[];
  migrations: Migration[];
  settings: Settings;
  range: { scenarios: RangeScenario[]; activeRun: RangeRun | null };
  serverTime: ISODate;
}

export type DirectorScenario =
  | "brute-force"
  | "c2-beacon"
  | "exfil"
  | "prompt-injection"
  | "leaked-token"
  | "reset-demo";
