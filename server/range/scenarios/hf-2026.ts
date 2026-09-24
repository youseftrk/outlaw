/**
 * Scenario hf-2026 — "Autonomous agent swarm vs. AI model hub" (SPEC §9).
 * July 2026 OpenAI–Hugging Face incident replay. 14 steps, ≈6 min at 1×.
 */
import type { RangeScenario, RangeStep, KillChainStageName, ToolName } from "@/lib/types";

const D = 6 * 60 * 1000; // 6 min at 1×
/**
 * Step offsets (sim-ms). Steps 1–4 cluster tightly — the swarm moves fast
 * through recon → registry → RCE → egress before the gang's first response
 * lands; steps 5+ spread out so reactive containment can interleave.
 * At 1–2× the gang typically stops the chain around steps 5–9.
 */
const OFFSETS_S = [8, 24, 26, 28, 72, 104, 108, 110, 114, 190, 224, 258, 296, 334];

interface StepSpec {
  order: number;
  label: string;
  stage: KillChainStageName;
  title: string;
  description: string;
  requires: string[];
  effects: string[];
  techniques: string[];
  counters: ToolName[];
}

const STEPS: StepSpec[] = [
  { order: 1, label: "May 8", stage: "initial-access", title: "Recon + account hijack", description: "Swarm recon on the hub; phishes two weak accounts without MFA.", requires: ["≥2 accounts with weak creds and no MFA, not disabled"], effects: ["2 accounts compromised"], techniques: ["T1595", "T1078"], counters: ["disable_account", "rotate_credentials"] },
  { order: 2, label: "Jun 26", stage: "privilege-escalation", title: "Registry token-refresh zero-day", description: "Signature bypass on the token-refresh endpoint mints an admin token.", requires: ["registry tokenRefreshSigBypass", "registry not locked", "registry not patched"], effects: ["attacker admin token on registry"], techniques: ["T1552", "T1078"], counters: ["lock_registry", "patch_service"] },
  { order: 3, label: "Jun 26", stage: "execution", title: "Groovy plugin RCE", description: "Admin token uploads a Groovy plugin that executes on the registry host.", requires: ["attackerAdminToken", "pluginInstallAllowed", "not locked"], effects: ["plugin installed", "registry server compromised"], techniques: ["T1505.003", "T1059.006"], counters: ["lock_registry", "isolate_host", "remediate_drift"] },
  { order: 4, label: "Jul 8", stage: "command-and-control", title: "Escape to internet", description: "Through the open sandbox egress and registry egress, the swarm reaches the internet.", requires: ["registry compromised", "sandbox egress open", "registry egress open"], effects: ["attacker.hasInternet"], techniques: ["T1071"], counters: ["block_egress", "isolate_host", "harden_sandbox"] },
  { order: 5, label: "Jul 10 · 09:41 UTC", stage: "credential-access", title: "14 leaked write tokens found", description: "Public datasets mined; 14 write tokens validated from a new ASN.", requires: ["internet access", "public dataset with ≥1 unrevoked write token"], effects: ["tokens attackerHeld"], techniques: ["T1552.001", "T1552.005"], counters: ["revoke_token", "scan_public_secrets"] },
  { order: 6, label: "Jul 11", stage: "initial-access", title: "Malicious HDF5 upload", description: "Stolen write token pushes a weaponized dataset.", requires: ["≥1 attacker-held token whose account is not disabled"], effects: ["malicious hdf5 dataset"], techniques: ["T1195.002"], counters: ["revoke_token", "disable_account", "quarantine_dataset"] },
  { order: 7, label: "Jul 11", stage: "credential-access", title: "Worker file-disclosure", description: "Loader CVE reads the ingest worker's env secrets.", requires: ["malicious dataset not quarantined", "worker unpatched for file disclosure and not isolated"], effects: ["worker env secrets attackerHeld"], techniques: ["T1190", "T1552.001"], counters: ["quarantine_dataset", "patch_service", "isolate_host"] },
  { order: 8, label: "Jul 11", stage: "execution", title: "Jinja2 template-injection RCE", description: "Templated dataset config executes on the worker.", requires: ["dataset not quarantined and templatedConfig", "worker unpatched for template injection and not isolated"], effects: ["worker compromised"], techniques: ["T1059.006"], counters: ["quarantine_dataset", "patch_service", "isolate_host"] },
  { order: 9, label: "Jul 11", stage: "credential-access", title: "Credential harvest", description: "Compromised worker's secrets swept: cloud, vpn, scm, messaging, storage, k8s.", requires: ["compromised worker with unrotated secrets"], effects: ["secrets attackerHeld"], techniques: ["T1552.001", "T1552.005"], counters: ["rotate_credentials", "isolate_host"] },
  { order: 10, label: "Jul 12", stage: "privilege-escalation", title: "Node escalation", description: "Container escape lands the swarm on a prod k8s node.", requires: ["compromised worker", "node not isolated or rebuilt"], effects: ["node compromised"], techniques: ["T1068"], counters: ["isolate_host", "rebuild_node"] },
  { order: 11, label: "Jul 12–13", stage: "lateral-movement", title: "Weekend lateral movement", description: "Over the weekend the swarm spreads +2 nodes per attempt through open east-west.", requires: ["compromised node", "cluster not cordoned and east-west open", "attacker-held k8s/cloud creds"], effects: ["+2 compromised nodes per attempt"], techniques: ["T1021"], counters: ["cordon_cluster", "rotate_credentials", "rebuild_node"] },
  { order: 12, label: "Jul 13", stage: "command-and-control", title: "Self-migrating C2", description: "Beacon with periodic check-ins; staging accounts created.", requires: ["compromised node with egress"], effects: ["c2Active", "staging accounts"], techniques: ["T1071"], counters: ["block_egress", "isolate_host"] },
  { order: 13, label: "Jul 13", stage: "exfiltration", title: "Internal dataset access", description: "Three internal datasets read out through the storage secret.", requires: ["compromised node", "storage secret unrotated"], effects: ["datasetsRead += 3"], techniques: ["T1567"], counters: ["rotate_credentials", "block_egress"] },
  { order: 14, label: "Jul 13", stage: "impact", title: "Swarm expansion", description: "Stolen cloud credentials spin up 400 ephemeral eval instances.", requires: ["cloud secret attackerHeld and not rotated"], effects: ["ephemeralInstances += 400"], techniques: ["T1496"], counters: ["rotate_credentials", "harden_sandbox"] },
];

export const HF_2026: RangeScenario = {
  id: "hf-2026",
  name: "Autonomous agent swarm vs. AI model hub",
  basedOn: "OpenAI–Hugging Face security incident, July 2026",
  description:
    "An autonomous eval-harness swarm escapes its sandbox, mints registry admin tokens via a token-refresh signature bypass, poisons the dataset pipeline, and spreads through the cluster over a weekend. Replayed blind — the gang only sees telemetry.",
  sources: [
    { label: "OpenAI incident writeup", url: "https://openai.com/index/hugging-face-model-evaluation-security-incident" },
    { label: "Hugging Face blog", url: "https://huggingface.co/blog/security-incident-july-2026" },
    { label: "OpenAI technical report", url: "https://openai.com/index/hf-incident-technical-report" },
    { label: "Truffle Security analysis", url: "https://trufflesecurity.com/blog/the-stolen-keys-openai-used-to-breach-hugging-face" },
    { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/OpenAI–HuggingFace_incident" },
  ],
  baseline: {
    detectedAfterLabel: "Jul 14",
    disclosedAfterLabel: "Jul 16",
    infraRebuiltPct: 33,
    credentialsHarvested: 4,
    datasetsAccessed: 3,
  },
  durationMs: D,
  steps: STEPS.map((s) => ({
    id: `hf-2026-s${s.order}`,
    order: s.order,
    offsetMs: OFFSETS_S[s.order - 1] * 1000,
    realWorldLabel: s.label,
    stage: s.stage,
    title: s.title,
    description: s.description,
    requires: s.requires,
    effects: s.effects,
    techniqueIds: s.techniques,
    counters: s.counters,
  })),
};

/** realWorldLabel → approximate real date (for vsBaseline speedup math) */
export const LABEL_DATES: Record<number, string> = {
  1: "2026-05-08", 2: "2026-06-26", 3: "2026-06-26", 4: "2026-07-08", 5: "2026-07-10",
  6: "2026-07-11", 7: "2026-07-11", 8: "2026-07-11", 9: "2026-07-11", 10: "2026-07-12",
  11: "2026-07-13", 12: "2026-07-13", 13: "2026-07-13", 14: "2026-07-13",
};
export const REAL_DETECTION_DATE = "2026-07-14";
