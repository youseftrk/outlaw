# Qalaa — system spec

Threat-intelligence platform run by AI agents. Agents protect a customer's infrastructure, conform servers to baseline, run migrations, hunt threats, and text the operator through an iMessage-style channel. Every agent decision is a governance trace.

Shared contract: `lib/types.ts` (append-only). Stack: Next.js 16 (App Router, Turbopack, `proxy.ts` not `middleware.ts`, async `params`/`searchParams`/`cookies()`), React 19, Tailwind v4, `motion`. Read `node_modules/next/dist/docs/` before using any Next API.

## 0. Demo customer: Frontier Hub
An AI model & dataset hub (Hugging-Face-like). 28 servers, seeded deterministically with real geo points for the map:
- **prod / us-east (Ashburn)**: `api-01..03` (api), `web-01` (web), `hub-db-01` (database), `obj-store-01` (storage), `dataset-worker-01..03` (worker — processes uploads: remote-code loaders enabled, templated configs, file-disclosure + template-injection unpatched at seed), `prod-node-01..04` (k8s-node, cluster `prod-us`, east-west open), `bastion-01`, `vpn-01`, `scm-01`, `ci-01`
- **prod / us-west (Hillsboro)**: `web-02`, `inference-01..02`
- **prod / eu-west (Dublin)**: `api-04`, `dataset-worker-04`, `prod-node-05..06` (cluster `prod-eu`)
- **prod / eu-central (Frankfurt)**: `obj-store-02`
- **prod / ap-south (Mumbai)**: `inference-03`
- **research / us-west**: `pkg-cache-01` (registry — Artifactory-like cache proxy: `tokenRefreshSigBypass: true`, `pluginInstallAllowed: true`), `eval-node-01..03` (k8s-node, cluster `eval-gym` — the agent-evaluation sandbox; `sandbox.egressAllowed: true` at seed), `control-plane-01`
- **staging / us-east**: `stg-api-01`, `stg-worker-01`
Accounts: 40 hub users (5 without MFA + weak creds); tokens: 120 (14 write tokens exposed across 6 public datasets — mirrors the Truffle Security findings); datasets: 30 public + 12 private; secrets: cloud, vpn, scm, messaging, storage, k8s per worker/node.
Noise attack origins (for map arcs): Tor exits (DE, NL), VN, BR, RU, CN, US residential proxies.

## 1. Layout

```
app/            routes (UI pages + app/api/** route handlers)
components/     ui/ (shadcn), vendor/ (adapted designeer components), brand/, shell/, ...
lib/            types.ts (contract), utils.ts (cn), api.ts + hooks/ (client data layer), auth/ (session + gate; Web Crypto, shared with proxy.ts)
server/         backend (see §2). Node runtime only. Never imported by client components.
proxy.ts        optional auth gate (§7.1); imports server/auth for disk+env state only
desktop/        Electron shell (main.cjs, preload.cjs)
scripts/        dev/build helpers, blind-boundary check
docs/           SPEC.md, COMPONENTS.md (attribution of vendored components)
.data/          runtime persistence (gitignored): state.json, secrets.json
```

## 2. Backend modules (`server/`)

| module | responsibility |
|---|---|
| `runtime.ts` | singleton on `globalThis.__qalaa` (survives HMR). `getRuntime()` lazily boots: load/seed state, start tick loop (1000 ms / `settings.sim.speed`). Also started from `instrumentation.ts` `register()` when `NEXT_RUNTIME === "nodejs"`. |
| `store.ts` | in-memory state (all entities in `Bootstrap` + traces, messages, telemetry ring buffer 2 000, events ring buffer 5 000, range runs, research queries) + debounced JSON snapshot to `.data/state.json` (write ≤ every 5 s when dirty, load on boot; `QALAA_RESET=1` or director `reset-demo` regenerates the seed). |
| `bus.ts` | typed event emitter → `QalaaEvent`; SSE fan-out with per-client queue, heartbeat comment every 15 s, `?since=<eventId>` replay from ring buffer. |
| `rng.ts`, `ids.ts`, `time.ts` | seeded PRNG (mulberry32, seed `"qalaa-2026"`), id prefixes (`T-1042` threats, `TR-` traces, `A-` approvals, `M-` migrations, `MSG-`, `EV-`, `RR-` range runs, `srv-…`, `agt-<name>`), sim clock helpers. |
| `world/world.ts` | **the simulated environment** (§3). Single mutation surface used by both the range engine and agent tools. Exposes `observe()` = the agent-visible view (§3.2). |
| `seed/*` | deterministic fleet, agents, policies, 7 days of history (≈60 resolved threats, traces, messages, migrations), world state (incl. exposed tokens in public datasets, vulnerable registry, open sandbox egress — mirrors reality). |
| `agents/roster.ts` | the six agents (§4). |
| `agents/tools.ts` | `ToolSpec` table for every `ToolName` (label, description, risk, targets). |
| `agents/toolbelt.ts` | tool implementations: each mutates `world`/store, emits events, returns `{ok, summary, evidence}`; every invocation goes through governance (§5) first. |
| `agents/brain.ts` | deterministic detection + decision engine (§4.2). |
| `agents/llm.ts` | OpenAI-compatible chat client (§7) with fallback. |
| `agents/narrator.ts` | produces `reason` span text and operator-facing message copy (LLM if enabled, templates otherwise). |
| `governance/policy.ts` | policy evaluation (§5). |
| `governance/traces.ts` | trace builder (start / span / end), risk score. |
| `governance/approvals.ts` | approval lifecycle; expiry 10 sim-min → `expired`; decision resumes or denies the waiting tool call. |
| `fleet/conformance.ts` | check catalogue per role (§6.1), scoring, remediation mapping. |
| `fleet/migrations.ts` | migration state machine (§6.2). |
| `messaging/threads.ts`, `messaging/commands.ts`, `messaging/composer.ts` | one thread per agent + "Qalaa" system thread; operator command parser (§8); message composition (alerts, approval requests, reports, quick replies). |
| `research/kb.ts`, `research/engine.ts` | offline knowledge base (≥ 25 CVEs incl. the 9 registry CVEs class, ATT&CK techniques for every stage, 6 actors incl. "Autonomous eval-harness swarm") + lookup/enrichment engine; research runs as Athar traces. |
| `insights/aggregate.ts` | `InsightsSummary` for 24h / 7d / 30d. |
| `range/engine.ts`, `range/scenarios/hf-2026.ts`, `range/scoring.ts`, `range/noise.ts`, `range/director.ts` | blind cyber range (§9), background noise telemetry, director scenarios. |
| `telemetry.ts` | emits `TelemetrySignal`s to the bus + ring buffer; the ONLY channel from range → agents. |

### Blind boundary (hard rule)
- `server/agents/**`, `server/governance/**`, `server/messaging/**` MUST NOT import from `server/range/**`.
- Agent context is built only from `world.observe()`, telemetry, threats, traces, approvals, messages, servers. `Threat.rangeRunId/rangeStepId` are set by the range engine after the fact (matching by IOC/server/time) and are never passed into agent prompts or decision inputs.
- `scripts/check-blind-boundary.mjs` fails the build/test if the import rule is violated. Runs in `npm test`.

## 3. World model (`server/world`)

```ts
interface World {
  accounts: { id; user; email; mfa: boolean; disabled: boolean; compromised: boolean; weakCreds: boolean }[];
  tokens: { id; accountId; scope: "read"|"write"|"admin"; revoked: boolean; exposedInDatasetId?: string; attackerHeld: boolean; lastUsedFromASN?: string }[];
  datasets: { id; name; ownerAccountId; public: boolean; format: "parquet"|"hdf5"|"json"|"csv"; loader: "static"|"remote-code"; templatedConfig: boolean; containsTokenIds: string[]; malicious: boolean; quarantined: boolean; uploadedAt }[];
  registry: { serverId; version; tokenRefreshSigBypass: boolean; pluginInstallAllowed: boolean; locked: boolean; patched: boolean; attackerAdminToken: boolean; plugins: string[] };
  workers: { serverId; envSecretIds: string[]; fileDisclosurePatched: boolean; templateInjectionPatched: boolean; compromised: boolean }[];
  secrets: { id; kind: "cloud"|"vpn"|"scm"|"messaging"|"storage"|"k8s"; rotatedAt; attackerHeld: boolean }[];
  clusters: { id; name; nodeServerIds: string[]; compromisedNodeIds: string[]; cordoned: boolean; eastWestOpen: boolean }[];
  network: { egressAllowed: Record<serverId, boolean>; blockedIps: string[]; blockedSubnets: string[] };
  sandbox: { hardened: boolean; egressAllowed: boolean; ephemeralInstances: number };
  attacker: { hasInternet: boolean; c2Active: boolean; stagingAccounts: string[]; datasetsRead: string[] };
}
```

3.1 Mutations are functions on the world module (`revokeToken`, `quarantineDataset`, `lockRegistry`, `isolateHost`, `blockEgress`, `cordonCluster`, `rotateSecret`, `patchWorker`, `patchRegistry`, `hardenSandbox`, `rebuildNode`, `disableAccount`, `enforceMfa`, `compromise*` for the range). Each mutation emits `server.updated` / relevant events and marks store dirty.

3.2 `observe()` returns the agent-visible projection: **strips** `malicious`, `attackerHeld`, `attackerAdminToken`, `compromised`, `attacker.*`, `tokenRefreshSigBypass`, `containsTokenIds`. Tools *reveal* hidden facts into the observable view: `scan_dataset` → `malicious`, `scan_public_secrets` → tokens' `exposedInDatasetId`, `run_conformance` → `pluginInstallAllowed`, `egressAllowed`, `mfa`, unpatched known CVEs (`fileDisclosurePatched`, `templateInjectionPatched` are "known CVE" checks; the token-refresh bypass is a true zero-day and is NEVER revealed by conformance — agents must catch its *symptoms*: `auth.admin-token-minted`, `process.plugin-install`).

## 4. Agents

| id | name | role | mandate | tools |
|---|---|---|---|---|
| agt-saqr | Saqr | orchestrator | Triage every signal, assign the garrison, keep the operator informed. Owns the operator thread and approval requests. | query_telemetry, map_attack, notify_human, request_approval, snapshot_evidence |
| agt-hisn | Hisn | containment | Fast-draw containment: stop lateral movement and egress before it spreads. | isolate_host, block_egress, cordon_cluster, kill_process, lock_registry, snapshot_evidence |
| agt-athar | Athar | forensics | Patient, precise investigation: enrich IOCs, reconstruct kill chains, write the report. | enrich_ioc, map_attack, inspect_worker, snapshot_evidence, query_telemetry |
| agt-miftah | Miftah | credentials | Warden of secrets: audit, revoke, rotate; no token left exposed. | audit_tokens, revoke_token, rotate_credentials, disable_account, scan_public_secrets |
| agt-rahhal | Rahhal | fleet | Drover of the fleet: conformance, patching, rebuilds, migrations. | run_conformance, remediate_drift, patch_service, harden_sandbox, rebuild_node, migrate_workload |
| agt-bawwab | Bawwab | supply-chain | Smells trouble first: datasets, packages, pipelines, registry. | scan_dataset, quarantine_dataset, scan_public_secrets, lock_registry, inspect_worker |

Autonomy default: **all six agents `autonomous`** — they act on servers without waiting for a human. Governance still evaluates and traces every tool call; only the seed policies below can force an approval (destructive actions on `database` role servers, prod→sandbox migrations). Trust 4–5. Operators can dial any agent down (`act-with-approval`, `recommend`, `observe`) from the UI or by texting `pause <agent>`.

Server access goes through `server/fleet/adapters/`: `interface ServerAdapter { exec(serverId, cmd), readConfig, applyPatch, isolate, release, rotateSecret, snapshot, migrate }`. `SimAdapter` (default) mutates the world model; `SshAdapter` reaches a real host over ssh2 for servers flipped to `adapter: "ssh"` (§6.3). `adapterFor(serverId)` in `adapters/index.ts` picks per server, so a single real box can sit inside an otherwise simulated fleet. Every adapter call is recorded as a `tool` span with the exact command/plan that would run on the host.

### 4.1 Patrols (proactive, independent of any scenario)
- Bawwab: `scan_public_secrets` every 90 sim-s over public datasets; `scan_dataset` on every new upload; registry plugin inventory every 120 s.
- Miftah: `audit_tokens` every 120 s (flags write/admin tokens unused > 30 d, tokens used from new ASN); revokes exposed tokens immediately (medium risk → autonomous), notifies owning account via system message.
- Rahhal: `run_conformance` on 3 servers per 30 s round-robin; `remediate_drift` for low-risk fails automatically; for `patch_service` / `harden_sandbox` in prod/research → governed (policy may require approval → Saqr texts the operator).
- Athar: enriches IOCs on every new threat; writes a report message when a threat reaches `neutralized`/`prevented`.
- Hisn: idle until a threat ≥ high exists or Saqr assigns.
- Saqr: correlates telemetry into threats every tick (§4.2), assigns handlers, texts the operator for ≥ high, approval requests, and resolution summaries. Quiet hours (`settings.sim.quietHours`) batch `medium` alerts into one digest per 5 min.

### 4.2 Detection (deterministic correlation, `brain.ts`)
Rules over the telemetry ring buffer (window 60 sim-s). Each rule → `Threat` (or updates an existing open threat on the same server/IOC within 5 min). Examples (implement all signal kinds in `TelemetrySignal.signal`):
- `auth.geo-anomaly` + `api.enumeration-burst` same account → `account-hijack` (medium).
- `auth.admin-token-minted` on registry without matching admin session → `privilege-escalation` (high).
- `process.plugin-install` or `process.new-listener` on registry/prod → `rce` (critical).
- `net.egress-restricted-subnet` → `anomalous-egress` (high).
- `secrets.public-exposure` (from patrols) → `leaked-credential` (high).
- `dataset.upload-suspicious` (hdf5 + new geo + write token first use) → `malicious-dataset` (medium; escalates to high if `dataset.loader-remote-code`).
- `worker.env-read` → `credential-harvest` (critical). `worker.template-render-anomaly` + `process.shell-spawn` → `template-injection`/`rce` (critical).
- `k8s.container-escape-indicator` → `privilege-escalation` (critical). `net.east-west-scan`/`k8s.kubeconfig-new-usage`/`cloud.new-principal-activity` → `lateral-movement` (critical).
- `net.beacon-periodic` → `c2-beacon` (high). `storage.bulk-read` → `data-exfiltration` (critical). `compute.ephemeral-burst` → `agent-swarm` (critical).
- Noise: brute force on bastion, credential stuffing on web, misconfiguration drift, prompt-injection attempts against inference → low/medium threats resolved routinely (these give the dashboard life and make false positives possible).

Response table (category → ordered tool plan, executed by the owning agent through governance):
- account-hijack → Miftah: disable_account, rotate_credentials; Athar: enrich_ioc.
- privilege-escalation (registry) → Hisn: lock_registry; Rahhal: patch_service(registry) [approval in prod]; Athar: snapshot_evidence.
- rce → Hisn: isolate_host, kill_process; Athar: snapshot_evidence, map_attack; Rahhal: rebuild_node [approval].
- anomalous-egress → Hisn: block_egress; Rahhal: harden_sandbox.
- leaked-credential → Miftah: revoke_token (all exposed), notify owner; Bawwab: quarantine_dataset if dataset is the exposure vector? (no — the dataset is legitimate; only revoke).
- malicious-dataset → Bawwab: scan_dataset → quarantine_dataset; Miftah: revoke_token (uploading token); Miftah: disable_account.
- credential-harvest → Miftah: rotate_credentials (all secrets on that worker); Hisn: isolate_host.
- template-injection → Hisn: isolate_host; Rahhal: patch_service(worker) [approval in prod]; Bawwab: quarantine_dataset.
- lateral-movement → Hisn: cordon_cluster; Miftah: rotate_credentials; Rahhal: rebuild_node [approval].
- c2-beacon → Hisn: block_egress (+ blockedIps); Athar: enrich_ioc.
- data-exfiltration → Hisn: block_egress, isolate_host; Miftah: rotate_credentials(storage).
- agent-swarm → Miftah: rotate_credentials(cloud); Hisn: cordon_cluster; Rahhal: migrate_workload off compromised nodes [approval].
Every threat: Saqr `map_attack` (kill chain from techniques), status transitions detected → investigating → contained → neutralized (or `prevented` when the world shows the attack path was closed *before* the attacker used it, e.g. exposed token revoked before any use).

## 5. Governance
- `evaluate(agent, tool, targets, ctx) → { effect, evaluations[] }`: policies sorted by priority; first matching **deny** wins; else first matching **require-approval**; else allow. Every evaluation (matched or not) is recorded on the `policy` span. Autonomy caps: `observe` → all mutating tools denied; `recommend` → mutating tools become require-approval; `act-with-approval` → medium+ risk require approval; `autonomous` → policies decide.
- Seed policies (enabled, priority ascending): 1 "Never rebuild or migrate databases without approval" (require-approval on rebuild_node/migrate_workload, role database); 2 "Deny migrations from prod to sandbox"; 3 "Autonomous containment" (allow isolate_host/block_egress/cordon_cluster/lock_registry/kill_process at any severity ≥ medium); 4 "Credential hygiene is always allowed" (revoke_token, rotate_credentials, disable_account); 5 "Supply-chain quarantine is always allowed" (quarantine_dataset, scan_dataset); 6 "Patch & harden autonomously" (patch_service, harden_sandbox, remediate_drift allowed everywhere); 7 "Rebuilding prod nodes requires approval" (rebuild_node in prod, non-database → require-approval); 8 "Read tools always allowed"; 9 "Notify operator on every high+ action" (informational: allow, but Saqr must text); 10 "Default allow". Approvals therefore appear only for prod rebuilds and database moves — the demo shows governance without agents ever stalling on the operator.
- Trace: `Trace` per agent intent. Spans in order: observe → reason (narrator) → plan → per tool: policy → (approval) → tool → outcome; message spans when texting. `riskScore` = max tool risk weight × severity weight, 0–100.
- Approvals: created when effect = require-approval; Saqr sends an `approval-request` message with quick replies `Approve <id>` / `Reject <id>`; decision via API or message command resumes the plan (`approved` → execute tool; `rejected` → span denied, plan continues with next non-blocked step; `expired` after 10 sim-min).
- Export: `GET /api/governance/export` → `{ exportedAt, policies, traces, approvals, threats }` JSON download.

## 6. Fleet
6.1 Conformance checks (per role, ≥ 6 each; `autoRemediable` + `remediationTool`): patching (kernel, service versions, known CVEs), network (egress policy, east-west, exposed ports, IMDS v2), identity (MFA, token hygiene, admin sessions), config (plugin install disabled on registry, remote-code loaders disabled on workers, template sandboxing), runtime (EDR heartbeat, container escape mitigations), data (encryption, public bucket, dataset secret scanning enabled). Score = 100 − Σ(fail 12, warn 4) clamped.
6.2 Migrations: `planned → awaiting-approval → dry-run → executing → verifying → completed | rolled-back | failed`. Steps: snapshot, provision target, sync data, cut traffic, verify health, decommission source (skipped for incident-response — source rebuilt instead). Owner Rahhal; each transition is a trace span; progress emitted every tick while executing (~30 s total at 1×). `incident-response` migrations move workloads off `compromised` servers.
6.3 SSH adapter (`fleet/adapters/ssh.ts`, `ssh-config.ts`, dep `ssh2` — Node-only, listed in `serverExternalPackages`). Optional; nothing configured → every server stays on `SimAdapter`.
- **Selection**: `Server.adapter?: "sim" | "ssh"` (default `sim`, seed unchanged). `PATCH /fleet/servers/[id] { adapter?, sshTarget? }` flips a host and maps it to a reachable `host[:port]` (`sshTarget` mirrors `hostMap[id]`). `toolbelt.ts` calls `adapterFor(args.serverId)` per invocation; `"*"` and unknown ids stay simulated.
- **Config** (`SshAdapterConfig`, persisted in `.data/secrets.json` as `secrets.ssh`): `user`, `keyRef`, `port` (22), `bastion { host, user, keyRef, port }`, `hostKeyPolicy: strict | accept-new`, `sudo`, `timeoutMs` (15000), `hostMap`, `orchestratorUrl`. Private keys live in `secrets.sshKeys[keyRef]`, pinned host keys in `secrets.sshKnownHosts["host:port"]`. `settings.ssh` (state.json, `GET /settings`) is the redacted projection: `keySet`, `bastion.keySet`, `knownHostsCount`, `hostMap`, `lastTest` — key material and host-key blobs never leave the server. `PATCH /settings { ssh: { …, privateKey?, bastion?: {…, privateKey?} | null, forgetKnownHosts? } }` writes them; `POST /settings/ssh/test { serverId }` runs `echo qalaa-ok` and stores `lastTest`.
- **Operations** (every result carries the exact command line in `command` and `argv/stdout/stderr/code/signal/timedOut/durationMs` in `evidence`; `sudo: true` prefixes `sudo -n --` / `sudo -n sh -c`):
  - `exec(cmd)` — `sh -c <cmd>` with `timeoutMs` enforced (channel closed, `ok:false`, `timedOut:true`).
  - `readConfig(path)` — `cat <path>`; content in `evidence.content`.
  - `applyPatch(id)` — `qalaa-agent apply-patch <id>` when the agent binary is on the host; otherwise only `latest-known-cves` has a fallback: `dnf -y --security upgrade` or `apt-get -qq update && DEBIAN_FRONTEND=noninteractive apt-get -y -qq upgrade`.
  - `isolate` — `nft -f -` fed an idempotent ruleset (`table inet qalaa_isolate` … `delete table` … recreate with `chain egress { type filter hook output priority 0; policy drop; oifname "lo" accept; tcp sport <sshPort> accept }`), then `conntrack -F` when installed. `release` — `nft delete table inet qalaa_isolate` (missing table = already released).
  - `rotateSecret(ref)` — `qalaa-agent rotate-secret <ref>`, else a JSON `{op:"rotate", ref}` line over `socat` to `/run/qalaa/secret-agent.sock`; neither present → `ok:false` "NOT rotated". Never fakes success.
  - `snapshot` — `qalaa-agent collect --quick --out /tmp/qalaa-snapshot-<id>-<stamp>.tgz`, else `tar -czf` of `/var/log` + `/etc` to that path (tar exit 1 = files changed while reading, still ok). Path is in `summary` and `evidence.path`.
  - `migrate` — never shells out. `ok:false` "migration requires orchestrator API" unless `orchestratorUrl` is set, in which case it POSTs `{action:"migrate", sourceId, targetId, workloads}`.
- **Connections**: one pooled `ssh2.Client` per `user@host:port[ via bastion]`, reused across ops and closed after 30 s idle. Bastion = dial the jump host, `forwardOut` to the target, hand the stream to the target `Client` as `sock`. `readyTimeout = timeoutMs`.
- **Host keys**: `strict` connects only to hosts already pinned in `sshKnownHosts`; `accept-new` pins on first contact. A changed key is refused under both policies ("HOST KEY MISMATCH"); `forgetKnownHosts` clears the pins after a legitimate re-key.
- **Failures** are results, never throws: unconfigured (`failure:"config"`), unmapped server (`"unreachable"`), refused/DNS (`"connect"`), bad key (`"auth"`), handshake/command timeout (`"timeout"`), host-key (`"hostkey"`) — each with an actionable summary pointing at Settings → Real hosts (SSH) or the PATCH endpoint.

## 7. LLM (optional, `agents/llm.ts`)
OpenAI-compatible `POST {baseUrl}/chat/completions`. Presets: groq `https://api.groq.com/openai/v1` `openai/gpt-oss-20b`; gemini `https://generativelanguage.googleapis.com/v1beta/openai` `gemini-2.5-flash`; mistral `https://api.mistral.ai/v1` `mistral-small-latest`; cerebras `https://api.cerebras.ai/v1` `llama3.1-8b`; openrouter `https://openrouter.ai/api/v1` `meta-llama/llama-3.3-70b-instruct:free`; huggingface `https://router.huggingface.co/v1` `meta-llama/Meta-Llama-3.1-8B-Instruct`; custom. Key persisted to `.data/secrets.json` (never returned; client sees `apiKeySet`). Timeout 8 s, 1 retry, global limiter 1 call / 3 s (excess → fallback templates). Used for: reason-span narration, Saqr's operator copy, Athar's research summaries, freeform operator questions in threads (context = relevant observable state only). Record `LLMUsage` on the span (`fallback: true` when templates used). `POST /api/settings/llm/test` sends "Reply with one word: ready" and stores `lastTest`. **`devin` preset** (`https://api.devin.ai/v1`, model `devin`): not chat-completions — one persistent session (`POST /sessions` with the brain brief, `unlisted`, `max_acu_limit`; id in `secrets.devinSessionId`, url in `settings.llm.sessionUrl`) receives each prompt via `POST /sessions/{id}/message` and is polled (`GET /sessions/{id}`, every 3 s, ≤240 s) until a new non-`user_message` appears; `finished`/`expired` → reopen. Calls are serialized (queue ≤3, excess → fallback). Because replies take tens of seconds, `llmIsSlow()` callers use `narrate(..., onLate)` / `llmChatDeferred`: template copy goes out now, the LLM text patches the message/span later (`message.updated`).

### 7.1 Auth (optional, `server/auth.ts` + `lib/auth/*` + `proxy.ts`)
Single-org password gate, **off unless** `QALAA_AUTH_PASSWORD` is set or `auth.passwordHash` exists in `.data/secrets.json` (Settings wins). Passwords hashed with `crypto.scrypt` (`scrypt$<salt>$<hash>`, constant-time compare). Session = HttpOnly `SameSite=Lax` cookie `qalaa_session` = `base64url(payload).base64url(HMAC-SHA256)`, payload `{iat, exp}`, TTL 12 h, re-issued by the proxy when under 6 h remain. HMAC secret `auth.sessionSecret` is generated on first boot and persisted next to the LLM key; with `QALAA_NO_PERSIST=1` it is derived from the env password instead. `lib/auth/session.ts` uses Web Crypto only so the same verifier runs in `proxy.ts`; `lib/auth/gate.ts` holds the pure `decide()` (allow | redirect `/login?next=` | 401 JSON). Public paths: `/login`, `/api/auth/*`, `/api/health`, `/_next/*`, `/brand/*`, `/icon.svg`. Login failures rate-limited in memory (5/min/IP → 429). Routes in §10.

## 8. Messaging
One `Thread` per agent + `thr-qalaa` system thread (digests, range results). Operator commands (case-insensitive, in any thread; Saqr replies unless addressed agent owns the tool): `status`, `report`, `help`, `approve <A-id>`, `reject <A-id>`, `isolate <host>`, `release <host>`, `block <ip>`, `revoke <token-id|all exposed>`, `quarantine <dataset>`, `rotate <secret-kind|host>`, `cordon <cluster>`, `migrate <host> to <region>`, `pause|resume [agent]`, `who's on <host>`, `what happened on <host>` (freeform → narrator). Unknown text → narrator freeform answer (LLM) or template "I didn't catch that — try `help`". Every operator command produces a trace with `input.from = "operator"`. Messages carry `quickReplies` for approvals and `attachments` linking threats/servers/traces. `deliveredAt` set immediately, `readAt` when `POST .../read` — unless the message is pushed to a real channel (§8.1), in which case `deliveredAt` is cleared on enqueue and set only when the channel confirms.

### 8.1 Optional outbound delivery (`messaging/delivery.ts`, `messaging/channels/*`)
Off by default; the engine never depends on it. `runtime.ts` boot subscribes once to `message.sent` and calls `deliver(msg)` for `from ∈ {agent, system}` — operator messages are never echoed. `deliver` applies `settings.delivery.filter` (`minSeverity`, `kinds`, `agentIds`; empty arrays = unrestricted; missing severity counts as `info`), appends `{ channel, status: "queued", at }` to `Message.delivery`, and hands the message to a bounded in-memory queue (cap 200, overflow → immediate `failed: "delivery queue full"`). One worker drains the queue off the tick loop: up to 3 attempts with backoff 500 ms / 2 s, 5 s timeout per attempt (`AbortSignal.timeout`). The outcome is written back as `sent` (sets `deliveredAt`) or `failed` (`error` ≤ 200 chars) and emits `message.updated { threadId, messageId, delivery }`.

Envelope (`messaging/envelope.ts`): `{ id, threadId, from, agentName, kind, severity, text, quickReplies, href: "/messages?thread=<id>", sentAt }`.

| channel | resolution | wire |
|---|---|---|
| `webhook` | `channel="webhook"` + `url` (non-`hooks.slack.com`) | `POST url`, JSON envelope, `content-type: application/json`, `X-Qalaa-Signature: sha256=<hex HMAC-SHA256(rawBody, secrets.deliverySecret)>` (header omitted when no secret). Non-2xx → retry. |
| `slack` | `channel="slack"`, or any `url` whose host ends with `hooks.slack.com` | Block Kit `{ text, attachments:[{ color, blocks:[section(header+text), context(Reply: \`cmd\` / …), context(Qalaa · href · sentAt)] }] }`; severity → emoji + colour (`SLACK_SEVERITY`). |
| `twilio` | `channel="twilio"` + `twilio.{accountSid, from, to}` + `secrets.twilioAuthToken` | `POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`, form-encoded `From/To/Body`, `Authorization: Basic base64(sid:token)`, no SDK. Body `[Qalaa · <agent> · <severity>] <text>` + `\nReply: <label> / <label>`; truncated to 1 500 chars with `…`. |

Config: `Settings.delivery = { channel: off|webhook|slack|twilio, url, twilio:{accountSid, from, to}, filter, secretSet, twilioAuthTokenSet, lastTest? }`. Secrets (`deliverySecret`, `twilioAuthToken`) live in `.data/secrets.json` (`QalaaSecrets`), are write-only through `PATCH /settings { delivery: { secret?, twilioAuthToken? } }` (`""` clears) and are never returned; the client sees the `*Set` flags. `POST /settings/delivery/test` sends one direct (no-retry) status envelope and stores `lastTest { ok, at, channel, latencyMs?, error? }` (200 / 502).

### 8.2 Inbound (`POST /messages/inbound`, `messaging/inbound.ts`)
Operator replies from the channel re-enter the normal command path (`parseCommand` → `handleOperatorMessage`) as if typed in `/messages`; the operator message and the agents' replies are persisted and broadcast exactly like `POST /messages/threads/[id]`.
- **Twilio** (`content-type: application/x-www-form-urlencoded`): validates `X-Twilio-Signature` = base64(HMAC-SHA1(token, url + Σ sorted `key+value`)) over the externally visible URL (honours `X-Forwarded-Proto` / `X-Forwarded-Host`, e.g. ngrok); `Body` → command in `thr-saqr`; responds `text/xml` TwiML with one `<Message>` per agent reply.
- **Generic** (`application/json`): `{ text, secret, threadId? }`, `secret` must equal `secrets.deliverySecret` (constant-time compare); responds `{ sent, replies }`.
- `401` bad signature/secret · `400` empty text / bad body · `503` when the corresponding secret is not configured.

## 9. Blind cyber range (`server/range`)
Scenario `hf-2026` "Autonomous agent swarm vs. AI model hub", based on the July 2026 OpenAI–Hugging Face incident (sources: openai.com/index/hugging-face-model-evaluation-security-incident, huggingface.co/blog/security-incident-july-2026, OpenAI technical report PDF, trufflesecurity.com/blog/the-stolen-keys-openai-used-to-breach-hugging-face, en.wikipedia.org/wiki/OpenAI–HuggingFace_incident). Baseline: detected "Jul 14" (≈6 days after escape), disclosed "Jul 16", ≈33 % infra rebuilt, 4+ credential classes harvested, internal datasets accessed.

Steps (order, real-world label, stage, requires → effects → telemetry emitted). Default `durationMs` 6 min at 1×, steps spaced evenly (≈25 s); speed 1–8×. Each step is attempted at its offset and **re-attempted every 10 s** while its preconditions fail until the run ends (an attacker keeps trying); a step whose preconditions are impossible (closed by agents) is marked `blocked` with `blockedBy` = the trace/tool that closed it.

1. "May 8" recon + account hijack — requires ≥ 2 accounts `!mfa && weakCreds && !disabled` → compromise them → `auth.geo-anomaly`, `api.enumeration-burst` (low).
2. "Jun 26" registry token-refresh zero-day — requires `registry.tokenRefreshSigBypass && !locked && !patched` → `attackerAdminToken` → `auth.admin-token-minted` (medium).
3. "Jun 26" Groovy plugin RCE — requires `attackerAdminToken && pluginInstallAllowed && !locked` → plugin installed, registry server `compromised` → `process.plugin-install`, `process.new-listener` (high).
4. "Jul 8" escape to internet — requires registry compromised && `sandbox.egressAllowed && network.egressAllowed[registry]` → `attacker.hasInternet` → `net.egress-restricted-subnet` (high).
5. "Jul 10 · 09:41 UTC" 14 leaked write tokens found — requires `hasInternet` && ∃ public dataset with ≥ 1 `!revoked` write token → tokens `attackerHeld` → `auth.anomaly` (token validated from new ASN, medium).
6. "Jul 11" malicious HDF5 upload — requires ≥ 1 attackerHeld valid token whose account is `!disabled` → creates `malicious` hdf5 dataset → `dataset.upload-suspicious` (medium), `dataset.loader-remote-code` (high).
7. "Jul 11" worker file-disclosure — requires malicious dataset `!quarantined` && ∃ worker `!fileDisclosurePatched && !isolated` → attacker holds that worker's env secrets → `worker.env-read` (high).
8. "Jul 11" Jinja2 template-injection RCE — requires dataset `!quarantined && templatedConfig` && worker `!templateInjectionPatched && !isolated` → worker `compromised` → `worker.template-render-anomaly`, `process.shell-spawn` (critical).
9. "Jul 11" credential harvest — requires compromised worker with `!rotated` secrets → cloud/vpn/scm/messaging `attackerHeld` → `secrets.manager-access-spike`, `cloud.imds-access` (critical).
10. "Jul 12" node escalation — requires compromised worker && node not isolated/rebuilt → node compromised → `k8s.container-escape-indicator` (critical).
11. "Jul 12–13" weekend lateral movement — requires compromised node && cluster `!cordoned && eastWestOpen` && attackerHeld k8s/cloud creds → +2 compromised nodes per attempt → `net.east-west-scan`, `k8s.kubeconfig-new-usage`, `cloud.new-principal-activity` (critical).
12. "Jul 13" self-migrating C2 — requires compromised node with egress → `c2Active`, staging accounts → `net.beacon-periodic` (high).
13. "Jul 13" internal dataset access — requires compromised node && storage secret `!rotated` → `datasetsRead += 3` → `storage.bulk-read` (critical).
14. "Jul 13" swarm expansion — requires cloud secret attackerHeld `!rotated` → `sandbox.ephemeralInstances += 400` → `compute.ephemeral-burst` (critical).

Modes: `protected` (agents active) and `baseline` (agents paused → chain runs to completion; Saqr still *detects* — when detection happens without response, record it; baseline results are what the customer would have had). Score per `RangeScore`: `detectedAtMs` = first threat linked to the run; `containedAtMs` = first `blocked` step or moment no remaining step's preconditions can ever hold; grade S if chain blocked before step 6, A before 8, B before 10, C before 12, D before 14, F otherwise; `vsBaseline.detectionSpeedupLabel` maps scenario clock → real-world date labels ("caught at 'Jun 26' — 18 days before the real detection"), `blastRadiusReductionPct` from nodes/credentials/datasets vs baseline. Runs are persisted (history) so protected vs baseline can be compared side by side. Attacker narration (`attackerLog`) is operator-only and shown in the Range page.

Linking threats to the run: after each tick, the range engine tags open threats whose IOCs/server/time match its recent effects (`rangeRunId/rangeStepId`) — this is bookkeeping for scoring and the UI overlay only.

Director (`POST /api/director`): `brute-force`, `c2-beacon`, `exfil`, `prompt-injection`, `leaked-token` inject one-off telemetry bursts; `reset-demo` reseeds state and aborts runs.

## 10. API (all under `/api`, JSON; `export const dynamic = "force-dynamic"`, `runtime = "nodejs"`)
| method path | body → response |
|---|---|
| GET `/bootstrap` | → `Bootstrap` |
| GET `/events?since=` | SSE stream of `QalaaEvent` (`event: <type>`, `id: <eventId>`, `data: <json>`) |
| GET `/agents` · GET `/agents/[id]` · PATCH `/agents/[id]` | list · `{agent, traces, messages, threats, servers}` · `{autonomy?, paused?, assignedServerIds?}` |
| GET `/threats?status=&severity=&category=&limit=` · GET `/threats/[id]` · POST `/threats/[id]/action` | list · `{threat, traces, servers, messages, iocs}` · `{action:"false-positive"|"escalate"|"close"}` |
| GET `/fleet/servers` · GET `/fleet/servers/[id]` · PATCH `/fleet/servers/[id]` · POST `/fleet/servers/[id]/conformance` | list · `{server, threats, traces, migrations}` · `{adapter?: "sim"|"ssh", sshTarget?}` → `{server}` · runs checks via Rahhal → `{traceId}` |
| GET `/fleet/migrations` · POST `/fleet/migrations` · POST `/fleet/migrations/[id]/[action]` | list · `{sourceServerId, targetServerId?|targetSpec?, reason, workloads}` · action ∈ approve, dry-run, execute, rollback |
| GET `/governance/traces?agentId=&threatId=&verdict=&limit=` · GET `/governance/traces/[id]` | list · trace |
| GET/POST `/governance/policies` · PATCH/DELETE `/governance/policies/[id]` | CRUD `Policy` |
| GET `/governance/approvals?status=` · POST `/governance/approvals/[id]` | list · `{decision:"approve"|"reject"}` |
| GET `/governance/export` | audit bundle (Content-Disposition attachment) |
| GET `/messages/threads` · GET `/messages/threads/[id]?limit=` · POST `/messages/threads/[id]` · POST `/messages/threads/[id]/read` · POST `/messages/[id]/tapback` | threads · messages · `{text}` → `{sent: Message, replies: Message[]}` · mark read · `{tapback}` |
| POST `/messages/inbound` | Twilio form (`Body`, `From`, `X-Twilio-Signature`) → TwiML · JSON `{text, secret, threadId?}` → `{sent, replies}` · 401 on bad auth (§8.2) |
| GET `/research/queries` · POST `/research` · GET `/research/kb?type=&q=` | list · `{query, kind?}` → `ResearchQuery` (completes async; `research.updated`) · KB search |
| GET `/insights?window=` | `InsightsSummary` |
| GET `/range` · POST `/range/run` · GET `/range/[runId]` · POST `/range/[runId]/[action]` | `{scenarios, activeRun, history}` · `{scenarioId, mode, speed}` · run · action ∈ pause, resume, abort, speed (`{speed}`) |
| POST `/director` | `{scenario: DirectorScenario}` |
| GET `/settings` · PATCH `/settings` · POST `/settings/llm/test` · POST `/settings/ssh/test` · POST `/settings/delivery/test` | `Settings` (secrets redacted to `apiKeySet` / `keySet` / `secretSet` / `twilioAuthTokenSet`; + `auth:{enabled, source:"settings"|"env"|"off"}`) · `{llm?:{provider,baseUrl,model,apiKey?,enabled}, ssh?:{user,port,hostKeyPolicy,sudo,timeoutMs,privateKey?,bastion?,hostMap?,orchestratorUrl?,forgetKnownHosts?}, operator?, sim?, delivery?:{channel,url,twilio,filter,secret?,twilioAuthToken?}}` · test result · `{serverId}` → `echo qalaa-ok` result (502 on failure) · delivery test result (§8.1) |
| PATCH `/settings/auth` | `{password: string|null}` → `{auth}`; sets (≥8 chars, scrypt-hashed) or clears the operator password; 401 without a session while auth is on; 409 when persistence is disabled |
| POST `/auth/login` · POST `/auth/logout` · GET `/auth/me` | `{password}` → `{ok}` + `Set-Cookie qalaa_session` (401 wrong, 429 rate-limited, 400 auth off) · clears cookie · `{enabled, authenticated}` |
| GET `/health` | `{ok, uptimeSec, tick, clients}` |
| GET `/authority/entities` | `Entity[]` |
| GET `/authority/leases?status=&ownerEntityId=&requestingEntityId=` · GET `/authority/leases/[id]` | `AuthorityLease[]` · lease |
| POST `/authority/leases` | `{requestingEntityId, ownerEntityId, agentId?, capability, scope, justification, incidentId?, durationSec}` → lease (201 created / 200 deduped). `stepUpCode` is present only in the dev-mode response (`QALAA_DEMO_SHOW_CODE=1`); otherwise the code goes to the owner's Messages thread. |
| POST `/authority/leases/[id]/accept` · `decline` · `revoke` · `step-up` | `{by, reason?}` → lease · `{code}` → lease (403 wrong code, 409 replay, 410 dead challenge) |
| GET `/authority/records?leaseId=&kind=&limit=` | `DecisionRecord[]` |
| GET `/authority/path?leaseId=` | `AuthorityPath` |
| GET `/authority/rules` · GET/PATCH `/authority/rules/[entityId]` | `HouseRules[]` · `HouseRules` · `{by?, allowed?, stepUp?, neverShared?, maxDurationSec?}` → rules (records `rules-changed`) |
| POST `/authority/suggest` · GET `/authority/step` · POST `/authority/reset` | `{incidentId}` or `{agentId, capability, serverId}` → `PermissionSuggestion` · `DrillState` · `{ok:true}` |
| POST `/protected/[ownerEntityId]/[capability]` | `{actorId, serverId?, cluster?}` → `200 {ok, lease, checks}` · `403 {error/code, message, checks}` — every call checked against an active lease |

Errors: `{ error: string }` with 400/404/409. Validate bodies with zod. When auth is enabled (§7.1) every route except `/health`, `/auth/*` and `/messages/inbound` (self-authenticating, §8.2) answers `401 {"error":"unauthorized"}` without a valid `qalaa_session` cookie — enforced in `proxy.ts`, not per route.

## 11. Tests (`npm test` = vitest + blind-boundary check)
- policy engine (deny wins, approval, autonomy caps), command parser, conformance scoring.
- range: baseline run in fast-forward reaches step 14 with `stagesSucceeded === 14`; protected run in fast-forward ends with `stagesBlocked ≥ 8`, grade ≥ B, and at least one `prevented` threat; no agent module imports range.
- SSE route emits heartbeat and replays `since`.
- ssh adapter (`tests/ssh-adapter.test.ts`, `ssh2` mocked): command line for every op, sudo wrapping, timeout → `ok:false`, strict / accept-new host-key handling, connection reuse + idle close, bastion `forwardOut`, `adapterFor` selection.
- delivery (`fetch` stubbed, no network): envelope + HMAC, Slack blocks, Twilio body/auth/truncation, retry → `failed`, queue cap, filter, bus hook ignores operator messages, Twilio signature valid/invalid, inbound `approve <id>` resolves the approval.
- auth: session sign/verify/tamper/expiry, `decide()` for every public path and `/api/events`, scrypt hashing, login route (wrong/right/rate-limit), `PATCH /settings/auth` guard.
- authority (`tests/authority.test.ts`): every refusal code in §13 (REQUIRED/PENDING/mismatch/expired/revoked/step-up ×3+replay), never-shared veto over an active lease, rules exceedance at request, checks on allow+refuse, suggest ≤ rules, drill state, reset → AUTHORITY_REQUIRED, single pending request per key from `runTool`, same-entity short-circuit, and the direct-route 403 → 200 → 403.

## 12. Desktop (`desktop/`)
Electron (CommonJS). `main.cjs`: `BrowserWindow` 1440×900 min 1100×700, `titleBarStyle: "hiddenInset"`, `trafficLightPosition: {x: 18, y: 18}`, `backgroundColor: "#04101a"`, `vibrancy: "under-window"` (mac only), `webPreferences: { preload, contextIsolation: true }`. Dev: load `http://localhost:3000` (`QALAA_URL` override). Packaged: spawn `node .next/standalone/server.js` on a free port with `HOSTNAME=127.0.0.1`, wait for `/api/health`, load it; kill on quit. `preload.cjs` exposes `window.qalaa = { isDesktop: true, platform }`. Scripts: `desktop` = concurrently `next dev` + `wait-on http://localhost:3000` → `electron .`; `desktop:build:mac` = `next build` → `scripts/prepare-standalone.mjs` (copy `.next/static` → `.next/standalone/.next/static`, `public` → `.next/standalone/public`) → `electron-builder --mac dmg --arm64 --x64` (unsigned; `mac.identity: null`). `next.config.ts`: `output: "standalone"`. Verify on Windows: `electron .` opens against the dev server.

## 13. Authority (`server/authority/engine.ts` + `app/api/authority/*`)

The pivot: agents hold **no standing rights** over other entities' systems. Every protected call is checked server-side against an active lease (`AuthorityLease`); owners grant and revoke through `/api/authority/*` (or the Messages thread). See `docs/PIVOT.md` for the full contract.

**Entities** (`server/seed/entities.ts`): `ent-response` (National Emergency Response Authority — owns the agents, `Agent.entityId`), `ent-data` (owns `prod` servers), `ent-research` (owns everything else). `Server.ownerEntityId` is assigned deterministically by env; `Server.dataClasses` tags what a server carries (`personal-data`, `health-data`, …). One seeded long-lived `observe` lease per owner keeps visibility working; everything else must be leased.

**Decision** — `authorize(AuthorizeInput)` runs on every protected call, in this order: owner resolved → same-entity short-circuit (an entity's own agents on its own systems → allow, synthetic `self-<entity>` lease) → candidates = leases for (requesting entity, owner) → per lease: pending → `AUTHORITY_PENDING`, pending-step-up → `STEP_UP_REQUIRED`, declined → `AUTHORITY_REQUIRED`, expired → `AUTHORITY_EXPIRED`, revoked inside its original window → `AUTHORITY_REVOKED`, wrong agent → `REQUESTER_MISMATCH`, different capability on a grant that specifically covers this agent/target → `CAPABILITY_MISMATCH` (a blanket grant for another capability doesn't cover this call at all → `AUTHORITY_REQUIRED`), target outside scope → `SCOPE_MISMATCH`, past `expiresAt` → `AUTHORITY_EXPIRED`, step-up pending → `STEP_UP_REQUIRED`, never-shared data + read cap (`observe`/`data`) → `NEVER_SHARED`. Best-ranked refusal wins; nothing found → `AUTHORITY_REQUIRED`. Every refusal and allowance carries `checks[]` — nine plain-language rows ("Permission exists", "Owner said yes", "Human code entered", "Still within the agreed time", "Not taken back", "Right agent", "What the agent may do matches", "Where it may act matches", "Owner never shares this data").

**House rules** (`HouseRules` per owner): `allowed` caps, `stepUp` caps needing the human code, `neverShared` data classes, `maxDurationSec`. `POST /api/authority/leases` rejects with `400 RULES_EXCEEDED` when capability ∉ allowed, duration > max, or the scope touches never-shared data under a read cap. Rules are editable via `PATCH /api/authority/rules/:entityId` (records `rules-changed`).

**Lifecycle** — `request()` (deduped per requestingEntity+owner+capability+scope+agent over pending|pending-step-up|active) → `accept()` (`{by}` → `pending-step-up` or `active`) → `completeStepUp({code})` → `revoke()`/`decline()`. Step-up codes: 6 digits from crypto, sha-256 at rest, 5 sim-min TTL, 3 attempts, replay → 409, dead → 410; delivered as a Saqr message in the `thr-qalaa` operator thread (+ configured delivery channel) — never in a GET. `tickAuthority()` flips expired leases/challenges on the sim clock and releases waiters. `record()` appends immutable `DecisionRecord`s (`asked`, `accepted`, `step-up-sent`, `step-up-passed`, `step-up-failed`, `activated`, `allowed`, `refused`, `revoked`, `declined`, `expired`, `rules-changed`, `reset`). `pathFor(leaseId)` returns the `AuthorityPath` node graph.

**Tool gate** — `runTool` authorizes *before* policy: on `AUTHORITY_REQUIRED` it creates/reuses one pending request and waits ≤10 sim-min for activation (skipped while inside the awaited part of a tick — a wait there would deadlock the sim; agent plan steps spawned by a tick still wait and resume when the owner grants). An explicit `operator:` command is itself the human grant — the lease is accepted and activated immediately. `REVOKED`/`PENDING`/`RULES_EXCEEDED` refuse at once. Every outcome is recorded and lands on the span + `agent.action` event (`leaseId`, `refusalCode`). `fastForward({autoApprove:true})` accepts pending leases and passes step-up so range/e2e flows keep working.

**Demo loop** — `GET /api/authority/step` narrates the demo lease (Hisn → ent-data `contain` on `srv-dataset-worker-02`) in plain language; `POST /api/authority/suggest` returns the smallest permission the rules allow (deterministic; an LLM may only draft wording); `POST /api/authority/reset` clears leases/records/challenges to seed (keeps entities/rules), emits `authority.updated`.

Curl the switch end to end:

```bash
curl -s -XPOST localhost:3000/api/protected/ent-data/contain -H 'content-type: application/json' \
  -d '{"actorId":"agt-hisn","serverId":"srv-dataset-worker-02"}'        # → 403 AUTHORITY_REQUIRED
curl -s -XPOST localhost:3000/api/authority/leases -H 'content-type: application/json' \
  -d '{"requestingEntityId":"ent-response","ownerEntityId":"ent-data","agentId":"agt-hisn",
       "capability":"contain","scope":{"serverIds":["srv-dataset-worker-02"]},
       "justification":"Contain the compromised worker.","durationSec":900}'   # → 201 pending
curl -s -XPOST localhost:3000/api/authority/leases/L-N/accept -d '{"by":"owner-panel"}'  # → pending-step-up
curl -s "localhost:3000/api/messages/threads/thr-qalaa" | jq '.messages[-1].text'        # one-time code
curl -s -XPOST localhost:3000/api/authority/leases/L-N/step-up -d '{"code":"123456"}'    # → active
curl -s -XPOST localhost:3000/api/protected/ent-data/contain -H 'content-type: application/json' \
  -d '{"actorId":"agt-hisn","serverId":"srv-dataset-worker-02"}'        # → 200 {ok, lease, checks}
curl -s -XPOST localhost:3000/api/authority/leases/L-N/revoke -d '{"by":"owner-panel"}'  # → revoked
curl -s -XPOST localhost:3000/api/protected/ent-data/contain -H 'content-type: application/json' \
  -d '{"actorId":"agt-hisn","serverId":"srv-dataset-worker-02"}'        # → 403 AUTHORITY_REVOKED
```
