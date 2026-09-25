<p align="center">
  <img src="public/brand/logo.png" width="96" alt="Qalaa" />
</p>
<h1 align="center">Qalaa</h1>
<p align="center"><em>One switch that grants and revokes an AI agent's power.</em><br/>Every AI agent working across UAE government and enterprise systems acts only with permission from the organisation that owns the system — and that permission can be taken back in a second, with a written record.</p>

---

## The idea

Governments and companies are putting AI agents to work on real systems. Today nothing bounds what an agent from one organisation may do inside another organisation's systems, and nothing lets the owner take that power back instantly.

Qalaa is that switch. An agent asks for **exactly one thing**: *what* it may do, *where*, *why*, and *for how long*. The **owner** of the system says yes or no. High-risk actions need a one-time code entered by a person. Every allowed and refused attempt, and every time permission is taken back, is **written down by the server**.

The whole proof in one line: **refused → owner says yes → allowed → owner takes it back → refused again**, against the same protected action, checked on the server and not in the screen.

## What you see

| Page | What it does |
| --- | --- |
| **Home** (`/`) | The switch. Who is asking, what they may do, where, for how long, and whether the owner said yes. A live "try the door" panel makes a real protected call. |
| **Permissions** (`/permissions`) | Every request — waiting, on, closed. The owner accepts, declines or takes back. House rules per owner: what may be lent, what needs a human code, what is never shared, maximum duration. |
| **What happened** (`/record`) | The server-written record: who asked, who said yes, what was allowed, what was refused, when permission was taken back. Agent traces sit behind it for engineers. |
| **Run a drill** (`/drill`) | A guided walk through the full story in under two minutes. `/drill/replay` replays a real intrusion with the agents under permission. |
| **Agents** (`/agents`) | The garrison — six agents with no standing power: Saqr (coordination), Hisn (containment), Athar (evidence), Miftah (credentials), Rahhal (systems), Bawwab (supply chain). |
| **Incidents**, **Systems**, **Messages** | What the agents responded to, who owns which system, and the phone thread where alerts, approvals and one-time codes arrive. |
| **Why Qalaa** (`/why`) | Who it serves and the market demand behind it. |

Technical detail (HTTP codes, curl, checks) is always available under a **For engineers** disclosure, never in the main copy.

## How permission is enforced

Authorization state lives on the server. The UI only displays it.

- An agent is a permission-holder, not an administrator. No permission, no action.
- The organisation that owns the system accepts the request. The asking side cannot self-authorize.
- High-risk actions require a server-generated, six-digit, one-use code delivered to a person. Replays fail.
- `POST /api/protected/:ownerEntityId/:capability` re-checks on every call: permission exists · owner said yes · human code entered · still within the agreed time · not taken back · right agent · what and where match · owner never shares this data.
- Taking permission back affects the very next request.
- Owner house rules (`/api/authority/rules/:entityId`) are checked at request time and again at action time; a "never shared" data class refuses even an active permission.
- The model may draft the *explanation* of a request (`/api/authority/suggest`). Deterministic code decides whether it is allowed.

Anyone can bypass the UI and hit the protected endpoint directly:

```bash
curl -X POST localhost:3000/api/protected/ent-data/contain \
  -H 'content-type: application/json' \
  -d '{"agentId":"agt-hisn","serverId":"srv-dataset-worker-02"}'
# → 403 {"error":"AUTHORITY_REQUIRED"} … accept + code … → 200 … revoke … → 403 {"error":"AUTHORITY_REVOKED"}
```

## Run it

```bash
git clone https://github.com/youseftrk/qalaa.git && cd qalaa
npm install
QALAA_RESET=1 npm run dev     # http://localhost:3000 with a fresh seed
```

Desktop shell: `npm run desktop`. macOS DMG: `npm run desktop:build:mac` (unsigned; right-click → *Open* on first launch; logs and state under `~/Library/Application Support/Qalaa/`, override with `QALAA_DATA_DIR`).

Checks:

```bash
npm test              # lint (0 warnings) + vitest: authority lifecycle, policy, commands, components
npm run test:e2e      # Playwright, builds and starts an isolated server on port 3411
npm run build
```

## Demo (≈2 minutes)

0. `⌘K` → **Reset the demo**.
1. **Home** — Hisn wants to contain a system that belongs to the National Data Authority. **Try the door** → refused, no permission.
2. **Ask for permission** — what, where, why, how long. Switch to acting as the owner. The request is on the owner's desk.
3. **Say yes** — a one-time code arrives in **Messages**. Enter it. The permission is on.
4. **Try the door** again → allowed. **What happened** shows the record.
5. **Take it back** → try the door → refused. The very next attempt.

## Optional

- **Language model** — Settings → Agent brain. Groq, Gemini, Mistral, Cerebras, OpenRouter, Hugging Face, any OpenAI-compatible endpoint, or Devin (one long-lived session). Adds narrated reasoning and drafted explanations; the permission decision never depends on it. Keys stay in `.data/secrets.json`.
- **Message delivery** — Settings → Delivery. Push alerts, approvals and codes to a webhook, Slack or Twilio SMS; replies come back through `/api/messages/inbound`.
- **Auth** — `QALAA_AUTH_PASSWORD=…` or Settings → Access puts the UI and API behind one operator password. Off by default.

## Layout

```
app/           pages (App Router) + app/api/** route handlers (authority, protected, agents, messages…)
components/    authority/ (permission card, try door, record, house rules), ui/, shell/, compositions/
lib/           types.ts (contract), api.ts, hooks/use-authority.ts, format.ts, auth/
server/        authority engine, runtime, world model, agents, governance, fleet, messaging, range, auth
docs/          PIVOT.md (product contract), SPEC.md (system), DESIGN.md, COMPONENTS.md
```

## Sources

Replay scenario: OpenAI — *Hugging Face model evaluation security incident* · Hugging Face — *Security incident disclosure, July 2026* · Truffle Security · Reuters. Hostnames, accounts and tokens are simulated. UAE context: the April 2026 federal goal of moving half of government services onto agentic AI within two years (see `docs/PIVOT.md` for sources).
