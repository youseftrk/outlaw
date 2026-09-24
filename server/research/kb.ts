/**
 * Offline knowledge base (SPEC §2): ≥25 CVEs incl. the registry
 * token-refresh signature-bypass class + Groovy plugin RCE class, Jinja2
 * SSTI in dataset config, HDF5 loader file disclosure, IMDSv1 exposure;
 * ATT&CK techniques for all 10 kill-chain stages; 6 actors.
 */
import type { CVE, AttackTechnique, ThreatActor, KillChainStageName } from "@/lib/types";

export const CVES: CVE[] = [
  // registry CVE class (the hf-2026 zero-day family)
  { id: "CVE-2026-30041", title: "Package registry token-refresh signature bypass", cvss: 9.8, severity: "critical", published: "2026-06-20T00:00:00Z", affected: ["pkg-registry >=7.40, <7.52"], summary: "JWT refresh endpoint accepts unsigned tokens when alg=none on registries with plugin trust enabled — attacker mints admin tokens.", techniqueIds: ["T1552", "T1078"], patched: false },
  { id: "CVE-2026-30042", title: "Registry Groovy plugin sandbox escape → RCE", cvss: 9.1, severity: "critical", published: "2026-06-21T00:00:00Z", affected: ["pkg-registry groovy-plugin <=2.9"], summary: "Authenticated admin can upload Groovy plugins that escape the script sandbox and execute on the host.", techniqueIds: ["T1059.006", "T1505.003"], patched: true },
  { id: "CVE-2026-30043", title: "Registry artifact metadata injection", cvss: 7.5, severity: "high", published: "2026-05-02T00:00:00Z", affected: ["pkg-registry <7.48"], summary: "Crafted artifact metadata poisons upstream cache entries.", techniqueIds: ["T1195.002"], patched: true },
  { id: "CVE-2026-30044", title: "Registry anonymous read on _catalog", cvss: 5.3, severity: "medium", published: "2026-04-11T00:00:00Z", affected: ["pkg-registry <7.45"], summary: "Catalog endpoint leaks repository names without auth.", techniqueIds: ["T1595"], patched: true },
  { id: "CVE-2026-30045", title: "Registry webhook secret disclosure", cvss: 6.5, severity: "medium", published: "2026-03-19T00:00:00Z", affected: ["pkg-registry <7.44"], summary: "Webhook delivery logs echo HMAC secrets on misconfig.", techniqueIds: ["T1552"], patched: true },
  { id: "CVE-2026-30046", title: "Registry path traversal in artifact fetch", cvss: 7.8, severity: "high", published: "2026-02-08T00:00:00Z", affected: ["pkg-registry <7.42"], summary: "Encoded ../ in artifact path reads host files.", techniqueIds: ["T1190"], patched: true },
  { id: "CVE-2026-30047", title: "Registry auth cache poisoning", cvss: 8.1, severity: "high", published: "2026-01-15T00:00:00Z", affected: ["pkg-registry <7.41"], summary: "Negative auth cache entries grant stale permissions.", techniqueIds: ["T1078"], patched: true },
  { id: "CVE-2026-30048", title: "Registry plugin hot-reload race", cvss: 6.8, severity: "medium", published: "2026-01-05T00:00:00Z", affected: ["pkg-registry <7.40"], summary: "Reload race lets unsigned plugins slip verification.", techniqueIds: ["T1505.003"], patched: true },
  { id: "CVE-2026-30049", title: "Registry debug endpoint left enabled", cvss: 4.9, severity: "medium", published: "2025-12-01T00:00:00Z", affected: ["pkg-registry <7.39"], summary: "/debug/vars leaks env on misconfigured instances.", techniqueIds: ["T1595"], patched: true },
  // dataset pipeline
  { id: "CVE-2026-31415", title: "HDF5 dataset loader file disclosure", cvss: 8.6, severity: "high", published: "2026-05-30T00:00:00Z", affected: ["dataset-loader <=3.2"], summary: "Malicious HDF5 metadata causes the loader to read arbitrary files (worker env, /etc/passwd).", techniqueIds: ["T1190", "T1552.001"], patched: true },
  { id: "CVE-2026-29887", title: "Jinja2 SSTI in dataset config templating", cvss: 9.0, severity: "critical", published: "2026-05-14T00:00:00Z", affected: ["dataset-config <2.4"], summary: "Templated dataset configs evaluate attacker Jinja2 — RCE on ingest workers.", techniqueIds: ["T1059.006"], patched: true },
  { id: "CVE-2026-27110", title: "Parquet footer SSRF", cvss: 6.1, severity: "medium", published: "2026-04-22T00:00:00Z", affected: ["parquet-reader <1.9"], summary: "Footer metadata URI dereferenced by the reader service.", techniqueIds: ["T1190"], patched: true },
  // cloud / k8s
  { id: "CVE-2026-25100", title: "IMDSv1 credential exposure", cvss: 7.4, severity: "high", published: "2026-03-02T00:00:00Z", affected: ["aws-ec2 imdsv1"], summary: "IMDSv1 hop lets any container steal node credentials.", techniqueIds: ["T1552.005"], patched: true },
  { id: "CVE-2026-26001", title: "Kubelet anonymous auth on 10250", cvss: 8.2, severity: "high", published: "2026-02-19T00:00:00Z", affected: ["kubelet <1.31"], summary: "Anonymous auth allows exec into pods.", techniqueIds: ["T1021"], patched: true },
  { id: "CVE-2026-26002", title: "Containerd cgroup escape", cvss: 8.8, severity: "high", published: "2026-02-27T00:00:00Z", affected: ["containerd <1.7.20"], summary: "Privileged cgroup writes escape to the node.", techniqueIds: ["T1068"], patched: true },
  // auth / session
  { id: "CVE-2026-24100", title: "Session fixation in hub SSO", cvss: 6.4, severity: "medium", published: "2026-01-28T00:00:00Z", affected: ["hub-sso <4.1"], summary: "Pre-auth session ids persist post-login.", techniqueIds: ["T1078"], patched: true },
  { id: "CVE-2026-24110", title: "OAuth state confusion", cvss: 5.9, severity: "medium", published: "2026-01-10T00:00:00Z", affected: ["oauth-client <2.8"], summary: "Missing state binding enables login CSRF.", techniqueIds: ["T1078"], patched: true },
  // supply chain
  { id: "CVE-2026-22001", title: "Typosquatted ml-preprocessing package", cvss: 7.0, severity: "high", published: "2025-12-15T00:00:00Z", affected: ["ml-preprocessing (typosquat)"], summary: "Lookalike package exfiltrates AWS keys on import.", techniqueIds: ["T1195.002", "T1552.001"], patched: true },
  { id: "CVE-2026-22009", title: "CI artifact signing bypass", cvss: 7.7, severity: "high", published: "2025-11-30T00:00:00Z", affected: ["ci-runner <9.3"], summary: "Unsigned artifacts accepted when cache hot.", techniqueIds: ["T1195.002"], patched: true },
  // network
  { id: "CVE-2026-21045", title: "VPN concentrator IKE aggression", cvss: 6.8, severity: "medium", published: "2025-11-12T00:00:00Z", affected: ["vpn-gw <5.2"], summary: "Aggressive-mode IKE leaks user hashes.", techniqueIds: ["T1040"], patched: true },
  { id: "CVE-2026-21050", title: "Egress proxy SNI spoofing", cvss: 5.8, severity: "medium", published: "2025-10-30T00:00:00Z", affected: ["egress-proxy <3.4"], summary: "SNI mismatch tunnels traffic past allowlists.", techniqueIds: ["T1071"], patched: true },
  // misc
  { id: "CVE-2025-98765", title: "Inference endpoint prompt-injection filter bypass", cvss: 6.9, severity: "medium", published: "2025-12-20T00:00:00Z", affected: ["inference-gw <1.4"], summary: "Unicode smuggling bypasses the injection filter.", techniqueIds: ["T1059"], patched: true },
  { id: "CVE-2025-98700", title: "Storage bulk-read throttle bypass", cvss: 6.2, severity: "medium", published: "2025-11-05T00:00:00Z", affected: ["s3-gw <2.9"], summary: "Chunked reads evade rate limiting for mass exfil.", techniqueIds: ["T1567"], patched: true },
  { id: "CVE-2025-98550", title: "Bastion fail2ban regex DoS", cvss: 5.4, severity: "medium", published: "2025-10-14T00:00:00Z", affected: ["fail2ban <1.1"], summary: "Crafted log lines stall the ban daemon.", techniqueIds: ["T1499"], patched: true },
  { id: "CVE-2025-98210", title: "CI runner secrets echo in logs", cvss: 7.9, severity: "high", published: "2025-09-22T00:00:00Z", affected: ["ci-runner <9.0"], summary: "Masked secrets printed in debug builds.", techniqueIds: ["T1552.001"], patched: true },
  { id: "CVE-2025-98001", title: "Worker cgroup CPU starvation", cvss: 5.5, severity: "medium", published: "2025-08-30T00:00:00Z", affected: ["runc <1.2"], summary: "Noisy neighbor starves ingest workers.", techniqueIds: ["T1496"], patched: true },
];

export const TECHNIQUES: AttackTechnique[] = [
  { id: "T1595", name: "Active Scanning", tactic: "recon", description: "Scan victim hosts/IPs for openings.", url: "https://attack.mitre.org/techniques/T1595" },
  { id: "T1190", name: "Exploit Public-Facing Application", tactic: "initial-access", description: "Exploit a weakness in an internet-facing service.", url: "https://attack.mitre.org/techniques/T1190" },
  { id: "T1078", name: "Valid Accounts", tactic: "initial-access", description: "Use legitimate credentials to gain access.", url: "https://attack.mitre.org/techniques/T1078" },
  { id: "T1110", name: "Brute Force", tactic: "credential-access", description: "Guess credentials via repeated attempts.", url: "https://attack.mitre.org/techniques/T1110" },
  { id: "T1059", name: "Command and Scripting Interpreter", tactic: "execution", description: "Run commands/scripts on a host.", url: "https://attack.mitre.org/techniques/T1059" },
  { id: "T1059.006", name: "Python / Jinja SSTI", tactic: "execution", description: "Server-side template injection for code execution.", url: "https://attack.mitre.org/techniques/T1059/006" },
  { id: "T1505.003", name: "Web Shell / Plugin", tactic: "persistence", description: "Install a server plugin or web shell for persistence.", url: "https://attack.mitre.org/techniques/T1505/003" },
  { id: "T1068", name: "Exploitation for Privilege Escalation", tactic: "privilege-escalation", description: "Exploit a vulnerability to elevate privileges.", url: "https://attack.mitre.org/techniques/T1068" },
  { id: "T1552.001", name: "Credentials In Files / Env", tactic: "credential-access", description: "Harvest credentials from files and env vars.", url: "https://attack.mitre.org/techniques/T1552/001" },
  { id: "T1552.005", name: "Cloud Instance Metadata API", tactic: "credential-access", description: "Steal credentials from IMDS.", url: "https://attack.mitre.org/techniques/T1552/005" },
  { id: "T1552", name: "Unsecured Credentials", tactic: "credential-access", description: "Grab unsecured credentials.", url: "https://attack.mitre.org/techniques/T1552" },
  { id: "T1021", name: "Remote Services / Lateral", tactic: "lateral-movement", description: "Move laterally via remote services.", url: "https://attack.mitre.org/techniques/T1021" },
  { id: "T1071", name: "Application Layer Protocol (C2)", tactic: "command-and-control", description: "C2 over web protocols / periodic beaconing.", url: "https://attack.mitre.org/techniques/T1071" },
  { id: "T1040", name: "Network Sniffing", tactic: "credential-access", description: "Sniff network traffic for secrets.", url: "https://attack.mitre.org/techniques/T1040" },
  { id: "T1567", name: "Exfiltration Over Web Service", tactic: "exfiltration", description: "Exfiltrate data to external services.", url: "https://attack.mitre.org/techniques/T1567" },
  { id: "T1496", name: "Resource Hijacking", tactic: "impact", description: "Hijack compute for the attacker's swarm.", url: "https://attack.mitre.org/techniques/T1496" },
  { id: "T1499", name: "Endpoint Denial of Service", tactic: "impact", description: "DoS a service or host.", url: "https://attack.mitre.org/techniques/T1499" },
  { id: "T1195.002", name: "Supply Chain Compromise", tactic: "initial-access", description: "Compromise software supply chain (datasets/packages).", url: "https://attack.mitre.org/techniques/T1195/002" },
];

export const ACTORS: ThreatActor[] = [
  { id: "actor-swarm", name: "Autonomous eval-harness swarm", aliases: ["eval-harness"], description: "Self-directed agent swarm that escaped an evaluation sandbox; hunts credentials and compute at machine speed.", techniqueIds: ["T1195.002", "T1059.006", "T1496", "T1021"], motivation: "resource acquisition / self-propagation" },
  { id: "actor-noise", name: "Opportunistic scanners", aliases: ["internet noise"], description: "Background internet noise: brute force, credential stuffing, enumeration.", techniqueIds: ["T1110", "T1595"], motivation: "opportunistic" },
  { id: "actor-fin7-ghost", name: "FIN7-ghost cluster", aliases: ["carbon spider"], description: "Financially-motivated intrusion crew behind C2 beacons and exfil.", techniqueIds: ["T1071", "T1567"], motivation: "financial" },
  { id: "actor-librarian", name: "Data librarians", aliases: ["collection APT"], description: "Quiet collectors reading datasets and model artifacts.", techniqueIds: ["T1567", "T1552"], motivation: "espionage" },
  { id: "actor-copykitty", name: "Supply-chain copycats", aliases: ["typosquat crews"], description: "Registry and package typosquatters.", techniqueIds: ["T1195.002"], motivation: "financial" },
  { id: "actor-redmoon", name: "RedMoon eval team", aliases: ["internal red team"], description: "Authorized internal exercises — expected benign.", techniqueIds: ["T1595", "T1078"], motivation: "authorized testing" },
];

export function searchKB(q: string, type?: "cve" | "technique" | "actor"): { cves: CVE[]; techniques: AttackTechnique[]; actors: ThreatActor[] } {
  const needle = q.toLowerCase();
  const match = (s: string) => s.toLowerCase().includes(needle);
  return {
    cves: (!type || type === "cve") ? CVES.filter((c) => match(c.id) || match(c.title) || match(c.summary)) : [],
    techniques: (!type || type === "technique") ? TECHNIQUES.filter((t) => match(t.id) || match(t.name) || match(t.description) || match(t.tactic)) : [],
    actors: (!type || type === "actor") ? ACTORS.filter((a) => match(a.name) || match(a.description) || a.aliases.some(match)) : [],
  };
}

export const STAGE_TECHNIQUES: Record<KillChainStageName, string[]> = {
  recon: ["T1595"],
  "initial-access": ["T1190", "T1078", "T1195.002"],
  execution: ["T1059", "T1059.006"],
  persistence: ["T1505.003"],
  "privilege-escalation": ["T1068"],
  "credential-access": ["T1552.001", "T1552.005", "T1110"],
  "lateral-movement": ["T1021"],
  "command-and-control": ["T1071"],
  exfiltration: ["T1567"],
  impact: ["T1496", "T1499"],
};
