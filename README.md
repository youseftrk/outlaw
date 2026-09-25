<p align="center">
  <img src="public/brand/logo.png" width="96" alt="Qalaa" />
</p>
<h1 align="center">Qalaa</h1>
<p align="center"><em>Every AI agent, protected.</em><br/>Threat intelligence run by a gang of autonomous AI agents — with a governance trace for every decision, and texts on your phone instead of tickets.</p>

---

## What it is

- **Six agents with outlaw names and distinct mandates** — Cassidy (orchestrator), Sundance (containment), Doc (forensics & research), Belle (credentials), Ringo (fleet: conformance, patching, migrations), Calamity (supply chain). All autonomous on servers; policy decides the few exceptions.
- **Governance traces** — every action is observe → reason → plan → policy → (approval) → tool → outcome. Exportable audit bundle.
- **Texts, not tickets** — an iMessage-style channel. Agents text alerts, approvals and reports; you text commands back (`isolate dataset-worker-02`, `approve A-1042`, `status`).
- **Fleet** — conformance scoring per host, automatic drift remediation, migrations with dry-run/verify/rollback.
- **Blind cyber range** — a replay of the July 2026 autonomous-swarm intrusion of a model hub. The agents don't know it's a drill; the import boundary is enforced in code and tests. Protected vs baseline scoring.
- **Research workbench** — IOC enrichment, CVEs, ATT&CK, actors, freeform investigations by Doc.
- **Insights** — the company view of what the agents protected.
- **Deck** — a brand slideshow at `/deck` (← → to navigate, `F` fullscreen, `⌘P` → PDF).
- **Desktop** — Electron shell with macOS inset traffic lights.

Every visual component is sourced from the designeer.xyz / libraries.dev catalogs (see `docs/COMPONENTS.md`). No hand-rolled UI.

## Run it (Mac or anywhere)

```bash
git clone https://github.com/youseftrk/qalaa.git && cd qalaa
npm install
npm run dev            # http://localhost:3000
```

Desktop shell (dev server + native window):

```bash
npm run desktop
```

Build the macOS app (must run on a Mac; unsigned .dmg lands in `release/`):

```bash
npm run desktop:build:mac
```

Tests (policy engine, command parser, blind range, boundary check):

```bash
npm test
```

## Optional: give the agents a language model

Detection and response are deterministic and always on. An LLM adds narrated reasoning, natural texts and freeform answers, with automatic fallback so the demo never stalls.

Settings → Agent brain → pick a preset (Groq is free, no card, fastest), paste a key, **Save & test**. Presets: Groq, Gemini, Mistral, Cerebras, OpenRouter, Hugging Face router, or any OpenAI-compatible endpoint. Keys live in `.data/secrets.json` (gitignored) and never reach the browser.

## Optional: message delivery

Messages always land in the in-app phone (`/messages`). Optionally, the gang's alerts, approval requests and reports are *also* pushed to one real channel, and your replies from that channel run through the same command parser as the in-app thread. Off by default; the deterministic engine is unaffected when nothing is configured.

Settings → Delivery → pick a channel, fill it in, **Save & send test**. A **minimum severity** and an **only alerts + approval requests** switch filter what leaves the box. Every pushed message shows `· sent via …` / `· delivery failed` under its bubble.

| Channel | Setup |
|---|---|
| **Webhook** | Any URL. Qalaa `POST`s a JSON envelope `{ id, threadId, from, agentName, kind, severity, text, quickReplies, href, sentAt }`. Set a **signing secret** and verify `X-Qalaa-Signature: sha256=<hex HMAC-SHA256 of the raw body>`. 5 s timeout, 3 attempts with backoff, bounded in-memory queue. |
| **Slack** | Create an [incoming webhook](https://api.slack.com/messaging/webhooks) and paste the `hooks.slack.com` URL (auto-detected even under "Webhook"). Rendered as Block Kit: severity → emoji + colour bar, quick replies as `Reply:` hints. |
| **Twilio SMS** | Account SID, auth token, your Twilio number (From) and your phone (To). Plain `fetch` to the Messages API with basic auth, body `[Qalaa · Cassidy · critical] <text>` + `Reply: Approve A-12 / Reject A-12`, truncated to 1 500 chars. |

**Replying from the channel** — `POST /api/messages/inbound`:

- **Twilio**: point the number's *A message comes in* webhook at `https://<your-host>/api/messages/inbound`. Qalaa validates `X-Twilio-Signature` with the auth token, feeds `Body` to the command parser (`approve A-12`, `status`, `isolate stg-worker-01`, …) and answers with TwiML so the agents' replies come back as SMS. For a laptop, expose the dev server with `ngrok http 3000` and use the ngrok URL — the signature is computed over the public URL, and Qalaa honours `X-Forwarded-Proto/Host`.
- **Generic**: `POST` JSON `{ "text": "approve A-12", "secret": "<signing secret>" }` → `{ sent, replies }`. Uses the same webhook signing secret. Bad secret / signature → `401`.

Secrets (signing secret, Twilio auth token) live in `.data/secrets.json` and never reach the browser; the API only reports `secretSet` / `twilioAuthTokenSet`.

## Demo script (≈8 minutes)

0. Before you go on: `⌘K` → **Reset the demo** (fresh seed, quiet world). The gang's response time depends on how busy the world is, so start clean.
1. **Command center** — fleet on the map, live feed, the gang on duty. `⌘K` opens the director palette (inject a brute-force burst, a C2 beacon, a leaked token…).
2. **Range** → *Start the replay* (protected, **2×** ≈ 3 minutes). Watch the attacker view (operator-only) and the gang's response side by side. Expect a handful of early stages to get through (recon, registry zero-day, escape, leaked tokens) before Calamity / Belle / Sundance shut the chain — that's the honest result; **4×–8×** shows the gang under real pressure.
3. **Messages** — Cassidy texts every detected stage. Reply `status`, `report`, or `isolate dataset-worker-01`; tap an approval if one appears.
4. **Governance** — open a trace; show the policy evaluations and the tool spans that ran on the server.
5. **Fleet** — quarantined dataset, isolated worker, Ringo's incident-response migration, conformance checks.
6. Back to **Range** — the score card vs. what really happened. Run **Baseline** (agents paused, 8×) to compare: 14/14 stages, grade F — the July 2026 outcome.
7. **Deck** (`/deck`, `F` for fullscreen; slide 11 pulls the live numbers from the last runs) for the close.

Keyboard: `⌘K` command palette · deck `←` `→` `F` `Esc` · `/deck?slide=N` deep links · `/phone` phone-only view for a second window.

## Layout

```
app/           pages (App Router) + app/api/** route handlers
components/    ui/ (shadcn + registries), vendor/, kibo-ui/, shell/, compositions/
lib/           types.ts (contract), api.ts, hooks/, format.ts
server/        runtime, world model, agents, governance, fleet, messaging, research, insights, range
desktop/       Electron main + preload
docs/          SPEC.md (system), DESIGN.md (design direction), COMPONENTS.md (inventory)
```

## Sources for the range scenario

OpenAI — *Hugging Face model evaluation security incident* and technical report · Hugging Face — *Security incident disclosure, July 2026* · Truffle Security — *The 14 leaked API keys* · Reuters, Scientific American, Wikipedia coverage. The replay uses the public timeline and mechanics; hostnames, accounts and tokens are simulated.
