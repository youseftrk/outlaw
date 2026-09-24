<p align="center">
  <img src="public/brand/logo.png" width="96" alt="Outlaw" />
</p>
<h1 align="center">Outlaw</h1>
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
git clone https://github.com/youseftrk/outlaw.git && cd outlaw
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

## Demo script (≈8 minutes)

1. **Command center** — fleet on the map, live feed, the gang on duty. `⌘K` opens the director palette.
2. **Range** → *Start the replay* (protected, 2×). Watch the attacker view (operator-only) and the gang's response side by side.
3. **Messages** — Cassidy texts what's happening. Reply `status`, or tap an approval.
4. **Governance** — open a trace; show the policy evaluations and the tool spans that ran on the server.
5. **Fleet** — the isolated worker, Ringo's incident-response migration, conformance checks.
6. Back to **Range** — the score card vs. what really happened. Run **Baseline** to compare.
7. **Deck** (`/deck`) for the close.

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
