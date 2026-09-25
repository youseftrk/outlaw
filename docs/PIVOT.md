# Qalaa pivot — one switch for every AI agent

> **Qalaa: one switch that grants — and instantly takes back — an AI agent's power.**
>
> The UAE is putting government and enterprise on AI agents: thousands of them, acting on real systems and real data.
> When an agent from one organisation needs to touch another organisation's systems — during an incident, say — someone
> must be able to say *"you may do this, here, for one hour"* and take it back in one second, with a record. Qalaa is that someone.

This document is the contract for the pivot. `lib/types.ts` (section "Authority") is the type contract; this file says what
the product is, what stays, what goes, and how the pieces connect. Anything not listed here is out of scope.

## 1. The idea in one sentence per audience

| Audience | Sentence |
| --- | --- |
| Citizen / viewer | Qalaa is the switch that decides what an AI agent is allowed to do — and turns it off. |
| Government CIO | Cross-entity agent access becomes a time-boxed permission the owning entity accepts and can revoke instantly, with a plain record. |
| Enterprise CISO | Agents hold no standing admin rights; every action on another department's systems is checked server-side against an active permission. |
| Engineer | A server-owned lease (`AuthorityLease`) is checked on every protected call; `403 AUTHORITY_REQUIRED` → `200` → `403 AUTHORITY_REVOKED`. The UI never grants. |

## 2. What stays, what goes, what changes

The agents stay — they are the workforce Qalaa governs. The threat-intelligence framing goes.

| Today | Pivot | Why |
| --- | --- | --- |
| `/` "Command center" (SOC KPIs, threats, wire) | `/` **Authority** — the switch. Entities, agents and what each may do right now, requests waiting for an owner, live record | The first screen must explain the product by itself |
| `/governance` (approvals, policies, traces) | `/permissions` — requests → accept (+ one-time code) → active → revoke; the record; approvals + policies as secondary tabs | Approvals are the human step inside the same story |
| `/threats` | `/incidents` — the *reason* an agent asks for permission. Same data, copy rewritten (no "threat intel", no IOC/ATT&CK jargon in headers) | An incident is why authority moves between entities |
| `/fleet` | `/systems` — every system shows its **owner entity**; agents listed as "may act under permission …" | Ownership is the core object |
| `/agents` | stays — copy: "an agent holds no standing power"; each detail page lists current permissions | The agentic workforce |
| `/messages`, `/phone` | stay — Saqr asks the owner for permission and delivers the one-time code here | The human channel |
| `/range` | `/drill` — "Run a drill": a rehearsed incident that plays the whole ask → yes → act → stop story on the seeded fleet | The demo runner; keep the engine, drop the "cyber range / blind range grading" copy |
| `/research` (CVE / ATT&CK / actors KB) | **removed** (route, API, seed data, tests) | Threat-intel feature, no role in the story |
| `/insights` | `/why` — "Why Qalaa": UAE agentic-workforce data + market-demand chart from `docs/research/market-demand.json` | Pitch page; the old SOC metrics go |
| `/deck` | **removed** (route, `app/deck`, e2e deck specs, deck fonts) | Owner: "no decks" |
| `/settings` | stays (operator, LLM, SSH, delivery, access) | |
| Sidebar groups Watch / Garrison / Govern | **Authority** (Authority, Permissions, Incidents) · **Workforce** (Agents, Systems, Messages) · **Prove** (Drill, Why Qalaa) · Settings | Nav tells the story top-down |

Copy rules everywhere in the app: permission (not lease), owner, switch, record (not receipt), refused / allowed (not 403/200
except in the engineer view), agent, data, incident. Short sentences. No "threat intelligence", "SOC", "gang", "range".

## 3. Domain model (see `lib/types.ts` → Authority)

- **Entity** — an organisation. Seeded: `ent-response` *National Emergency Response Authority* (operates the six agents),
  `ent-data` *National Data Authority* (owns prod systems: api/web/db/storage/workers/prod clusters),
  `ent-research` *Research & Compute Authority* (owns research + staging systems). Kinds: government. Jurisdiction "UAE".
  Ownership is assigned deterministically in the seed by `env`/`tags` — seed strings `qalaa-2026:*` are unchanged.
- **Agent.entityId** = `ent-response` for all six. **Server.ownerEntityId** per the rule above.
- **Capability** groups tools: `observe`, `contain`, `credentials`, `data`, `repair` (`TOOL_CAPABILITY`). Tools with no target are not gated.
- **AuthorityLease** — request and permission are one object through its life:
  `pending → pending-step-up → active → expired | revoked`, or `pending → declined`.
  `stepUpRequired` = capability ∈ `STEP_UP_CAPABILITIES`.
- **StepUpChallenge** — server-generated 6-digit code, hashed at rest, single-use, 5 sim-min TTL, max 3 attempts, delivered as
  a message from Saqr in the operator thread (and via the delivery channel if configured). Never returned by any GET.
- **DecisionRecord** — append-only, written only by the engine: asked, accepted, step-up-sent/passed/failed, activated, allowed,
  refused (with `RefusalCode`), revoked, expired, declined.
- **Seed**: one long-lived `observe` permission from each owner to `ent-response` ("agents may look, not touch") so the fleet
  keeps ticking; nothing else is pre-granted.

## 4. Enforcement — where the switch actually lives

`server/authority/engine.ts` → `authorize(input: AuthorizeInput): AuthorizeResult` is pure over store state and is the **only**
place that decides. It checks, in order: owner resolved (server → `ownerEntityId`; token/dataset/account targets → `ent-data`),
same-entity short-circuit (an entity's own agents on its own systems → allow, recorded as `allowed` with `lease` = none),
lease exists for (requesting entity, owner) → status `active` → agent/entity matches → capability matches → scope contains target →
not expired (sim clock) → not revoked → step-up done. Refusal codes are in `RefusalCode`; a lease that was revoked and whose
original window still covers now refuses with `AUTHORITY_REVOKED`, otherwise `AUTHORITY_REQUIRED`.

Two callers, same function:

1. **Agents** — `server/agents/toolbelt.ts#runTool` calls `authorize` *before* policy. If refused with `AUTHORITY_REQUIRED` the
   engine creates (or reuses) one pending request per (requesting entity, owner, capability, scope-key) with a plain justification
   from the incident, Saqr messages the owner, and the tool call waits (like `waitForDecision`) up to 10 sim-min for activation;
   on `AUTHORITY_REVOKED` / `AUTHORITY_PENDING` the call fails immediately and is recorded. Every outcome writes a `DecisionRecord`.
   The `agent.action` event and trace span carry `leaseId` and `refusalCode`.
2. **Direct API** — `POST /api/protected/:ownerEntityId/:capability` `{ actorId, serverId? }` returns `200 { allowed: true, leaseId, record }`
   or `403 { error: <RefusalCode>, record }`. Anyone can curl this outside the UI and see 403 → 200 → 403.

`revoke()` flips status synchronously; there is no cache, so the next call — from an agent or from curl — is refused.

## 5. API (all under `app/api/authority/*`, nodejs runtime, force-dynamic)

```
GET  /api/authority/entities
GET  /api/authority/leases?status=&ownerEntityId=&agentId=&incidentId=
GET  /api/authority/leases/:id                       (+ ?path=1 → AuthorityPath)
POST /api/authority/leases                           { requestingEntityId, ownerEntityId, agentId?, capability, scope, justification, incidentId?, durationSec }
POST /api/authority/leases/:id/accept                { by }            → pending-step-up (code sent) or active
POST /api/authority/leases/:id/decline               { by, reason? }
POST /api/authority/leases/:id/step-up               { code }          → active | 403 STEP_UP_REQUIRED (attempts++), replay → 409
POST /api/authority/leases/:id/revoke                { by, reason? }
GET  /api/authority/records?leaseId=&incidentId=&limit=
GET  /api/authority/path/:leaseId                    → AuthorityPath (server-derived from lease + records)
POST /api/protected/:ownerEntityId/:capability       { actorId, serverId?, cluster? }
```

Events (add to `EventType`): `authority.requested`, `authority.updated` (accept/step-up/activate/revoke/expire/decline),
`authority.decision` (every record). Bootstrap gains `entities` and `leases`.

## 6. Tests (vitest, `tests/authority.test.ts`) — the core invariant

no permission → refused `AUTHORITY_REQUIRED` · pending → `AUTHORITY_PENDING` · active + right agent + scope → allowed ·
wrong agent → `REQUESTER_MISMATCH` · wrong capability → `CAPABILITY_MISMATCH` · out-of-scope server → `SCOPE_MISMATCH` ·
expired (fastForward) → `AUTHORITY_EXPIRED` · revoked → `AUTHORITY_REVOKED` on the very next call · step-up wrong code ×3 →
challenge dead · step-up replay → rejected · records exist for asked / accepted / activated / allowed / revoked / refused ·
`runTool` on a foreign server without permission creates exactly one pending request and refuses · same-entity call allowed ·
the direct route returns 403 / 200 / 403 with the JSON codes above. Existing tests keep passing; range tests run with the
seeded `observe` permission plus auto-accept in `fastForward({ autoApprove })` (extend it to accept pending leases + step-up).

## 7. Demo — "Run a drill" (`/drill`) and the video

1. **Refused.** Drill starts an incident on `dataset-worker-02` (owner: National Data Authority). Hisn tries to contain it.
   Refused — `AUTHORITY_REQUIRED`. A request appears on `/` and `/permissions`; Saqr messages the owner.
2. **The owner says yes.** Owner accepts on `/permissions` (or replies in Messages). A one-time code arrives in the thread; owner enters it.
   Permission: *Contain · dataset-worker-02 · 1 hour · Incident T-…*. Active.
3. **Allowed.** Hisn's next attempt goes through. The record shows who asked, who allowed, what happened, when.
4. **Stop.** Owner flips the switch on `/`. Hisn's next call: `AUTHORITY_REVOKED`. The record closes the story.
5. `curl` panel on `/permissions` (engineer view) shows the same 403 → 200 → 403 against `/api/protected/...`.

## 8. Visual direction (owner's words)

Dark greens and near-black, no CSS gradients: Paper Shaders `GrainGradient` (`@paper-design/shaders-react`,
colors `#97ff52 #d1c9a9 #d7cbc6` on `#000a0f`, softness 0.7, intensity 0.15, noise 0.5, shape wave) as the ambient background
on `/`, `/why` and the login. Lime `#97ff52` is the single accent; red only for "Refused". No Instrument Serif, no Geist —
one characterful open-license grotesk loaded locally. Components only from the designeer.xyz / libraries.dev catalog already
inventoried in `docs/COMPONENTS.md`. Cuelume (`cuelume`, MIT) for UI sounds: `toggle` on the switch, `success` on allowed,
`error` on refused, `tick` on nav hover, `press`/`release` on primary buttons, muted by default with a footer toggle.

## 9. Non-negotiables

Backend state is canonical · the owner accepts, the requester never self-grants · the protected endpoint checks for itself ·
revocation is immediate · step-up is server-side, single-use · records are written by the engine only · the Authority Path is
derived from records · deterministic logic, the LLM only explains · `server/agents/**` never imports `server/range/**` ·
seed strings `qalaa-2026:*` unchanged · `public/brand/*` untouched.
