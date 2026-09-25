# Qalaa — build handoff

State of the world as of `c8f5039` on `main`. Everything in "Verified" was exercised live on Windows with screenshots and API output; the gaps section is honest about what was *not* done — don't present those as working.

## Verified working

- **14 routes**: `/` command center · `/agents` + `/agents/[id]` · `/threats` + `/threats/[id]` · `/fleet` (servers, conformance, migrations) · `/governance` (traces, policies, approvals, audit export) · `/messages` + `/phone` (iMessage-style) · `/research` (CVE/ATT&CK/actor KB + Doc investigations) · `/insights` · `/range` (blind benchmark) · `/settings` · `/deck` (brand slideshow, fullscreen + deep links `?slide=N`).
- **Deterministic agent gang**: Cassidy, Sundance, Doc, Belle, Ringo, Calamity — all `autonomous` by default, patrol servers, conform baselines, run migrations, detect/respond to telemetry, text the operator, and every action is policy-evaluated + fully traced.
- **Blind range (hf-2026)**: world re-arms to the July-2026 incident snapshot on run start; agents see only telemetry — scenario internals are provably unreachable (import boundary enforced by `scripts/check-blind-boundary.mjs`, part of `npm test`). Every step needs real preconditions; `blocked` is only credited when an agent's actual tool call closed that step's precondition. Measured on a fresh seed: 1×→S, 2×→A, 4×→A, 8×→B, baseline→F (14/14 — the real outcome).
- **Electron**: dev mode (`QALAA_URL`) and packaged mode (spawns `.next/standalone/server.js` via `ELECTRON_RUN_AS_NODE`, waits on `/api/health`) both verified on Windows with captured windows. macOS config in place: `titleBarStyle: "hiddenInset"`, traffic lights (18,18), vibrancy `under-window`.
- **Checks**: `npx tsc --noEmit` clean · `npm test` 92/92 (blind boundary clean) · `npm run test:e2e` 17/17 (Chromium) · `npm run build` green (37 API routes incl. `/api/messages/inbound` + `/api/settings/delivery/test`), all pages prerender.
- **Outbound delivery (webhook)**: agent alert → `POST` to a local receiver with a valid `X-Qalaa-Signature`; `approve <id>` posted to `/api/messages/inbound` resolves the approval and returns Cassidy's reply.

## Not finished / left to build

### Demo-critical (would show live)
1. **macOS DMG build never ran.** `npm run desktop:build:mac` is configured (electron-builder, `asar:false`, `desktop/icon.png` from the brand logo) but was only dry-verified on Windows. First run on the Mac may need `xattr -cr release/` for Gatekeeper, and an unsigned `.app` opens via right-click → Open.
2. **LLM never exercised with a real key.** Settings → Agent brain presets (Groq/Gemini/etc.) + limiter + fallback are implemented and the deterministic engine covers everything, but no provider key was ever pasted — `Save & test` is the smoke test. Groq free tier is the recommended key (console.groq.com/keys).

### Real (post-demo) work
3. **No real server adapters.** `ServerAdapter` contract exists; `SimAdapter` mutates the simulated world. `SshAdapter` is a documented skeleton — zero real SSH/exec capability by design.
4. **Message delivery is optional and off by default** (SPEC §8.1–8.2, README “Optional: message delivery”). Generic webhook (HMAC-signed envelope), Slack incoming webhook (Block Kit) and Twilio SMS (plain `fetch`, no SDK) push agent/system messages out of the box; `POST /api/messages/inbound` takes Twilio (signature-validated, TwiML reply) or JSON `{text, secret}` replies back through the same command parser. Settings → Delivery configures it; secrets stay in `.data/secrets.json`. Verified live only with a local webhook receiver — **Slack and Twilio were never exercised against real accounts** (adapters are covered by mocked-`fetch` tests only). No Messages.app/osascript bridge.
5. **Single-org password auth only (optional), no multi-tenancy.** Single demo org ("Frontier Hub"). Auth is OFF by default; set `QALAA_AUTH_PASSWORD` or Settings → Access to gate the UI + every API route behind `/login` (`proxy.ts`, HttpOnly HMAC cookie, 12 h sliding, 5 failures/min/IP). See README "Optional: auth" and SPEC §7.1. There is one password, no users/roles/audit of logins, and the rate limiter is per-process memory — still bind localhost or put it behind TLS before exposing.
6. **Persistence is a JSON file** (`.data/`, gitignored; `QALAA_DATA_DIR` overrides the directory — the e2e suite uses `.e2e-data/`). No database; `reset-demo` reseeds. Sufficient for the presentation.
7. **UI automated tests: Playwright + jsdom component tests** (`npm run test:e2e`, kept out of `npm test`). `e2e/*.spec.ts` cover the golden paths — command center + live SSE feed, agent detail pause via `PATCH`, threat detail + escalate, director-created approval resolved from the sheet, `status` / `Approve <id>` in Messages, a protected range run to a grade at 8×, settings slider save + reload, deck deep link + arrow keys, no horizontal overflow at 390×844 on `/`, `/fleet`, `/threats`, `/messages`, `/governance`, and `deck-print.spec.ts` (PDF page count). `tests/components/*.test.tsx` render `AgentAvatar`, `PageHeader`, `LiveFeed` and the approvals sheet under `// @vitest-environment jsdom`. `.github/workflows/ci.yml` runs `npm ci` → `npm test` → `npm run build` → Chromium e2e. Cassidy (orchestrator) never runs tools, so her Traces tab is legitimately `(0)`; the trace assertions use Sundance. `eslint` is still not wired into `npm test` (no lint script).
8. **Deck print/PDF verified** — `@media print` in `app/globals.css` now lays out `.deck-print` one slide per page (`@page 1920px 1080px`, zero margin, `print-color-adjust: exact`, BlurFade/animation opacity + transforms forced, live chrome hidden). `page.pdf({ width: "1920px", height: "1080px", printBackground: true })` on `/deck` yields exactly 14 pages (asserted by `e2e/deck-print.spec.ts`, PDF attached to the Playwright report).
9. **Rough edges closed**: `GET /api/agents/[id]` returns the agent's last 200 persisted events and the detail Live log is pre-filled from them before SSE appends (deduped by event id); the approvals sheet shows requesting agent avatar + name, tool, target server, trace risk score, policy reason, expiry countdown and Approve/Reject with loading + toast; fleet/threats/governance tables hide low-priority columns below `md` (`hidden md:table-cell`) so nothing clips at 390px — unchanged at ≥768px. Still open: "On the wire" feed timestamps are sim-clock.

### Gotchas to know
- **`reset-demo` before presenting.** Patrols harden the world over time — on a busy/hardened world the range attacker can also win late or the gang's numbers drift. `⌘K` → *Reset the demo* gives the measured S/A grades.
- **HMR doesn't hot-swap the tick loop.** After editing `server/` tick/brain/range modules, restart `npm run dev` — route modules reload, the `setInterval` does not.
- **Electron on Windows eats `/x` and URL-like positional args.** `scripts/screenshot.cjs` therefore takes `SHOT_OUT`/`SHOT_BASE` env vars and routes *without* leading slashes (`home agents range`).
- **Git identity isn't configured** in this environment — commits used `git -c user.name=youseftrk -c user.email=youseftrk@users.noreply.github.com`.
- **State resets on first boot** since `.data/` is gitignored — clone→`npm run dev` reseeds cleanly.
- **Component sourcing is documented** in `docs/COMPONENTS.md` (licenses incl. React Bits Commons Clause — fine embedded, don't redistribute standalone). 21st.dev needed a paid key, so `components/vendor/shadcn-chat` (MIT, jakobhoeg/shadcn-chat) was vendored.

## Reference docs
- `docs/SPEC.md` — full product/backend contract (entities, APIs, world model, range rules, policies, demo script).
- `docs/DESIGN.md` — brand system and per-page compositions.
- `docs/COMPONENTS.md` — every sourced component and license.
- `README.md` — run steps + the 8-minute demo script.

## Roadmap if continued
SSO/RBAC + org model → real adapters (SSH/agent binary) → Postgres → message channels verified against real Slack/Twilio accounts, Messages.app bridge → range scenario packs (ransomware, insider, supply-chain) → scheduled conformance reports → notarized dmg/notarization pipeline + CI.
