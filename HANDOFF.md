# Qalaa — build handoff

State of the world as of `c8f5039` on `main`. Everything in "Verified" was exercised live on Windows with screenshots and API output; the gaps section is honest about what was *not* done — don't present those as working.

## Verified working

- **14 routes**: `/` command center · `/agents` + `/agents/[id]` · `/threats` + `/threats/[id]` · `/fleet` (servers, conformance, migrations) · `/governance` (traces, policies, approvals, audit export) · `/messages` + `/phone` (iMessage-style) · `/research` (CVE/ATT&CK/actor KB + Doc investigations) · `/insights` · `/range` (blind benchmark) · `/settings` · `/deck` (brand slideshow, fullscreen + deep links `?slide=N`).
- **Deterministic agent gang**: Cassidy, Sundance, Doc, Belle, Ringo, Calamity — all `autonomous` by default, patrol servers, conform baselines, run migrations, detect/respond to telemetry, text the operator, and every action is policy-evaluated + fully traced.
- **Blind range (hf-2026)**: world re-arms to the July-2026 incident snapshot on run start; agents see only telemetry — scenario internals are provably unreachable (import boundary enforced by `scripts/check-blind-boundary.mjs`, part of `npm test`). Every step needs real preconditions; `blocked` is only credited when an agent's actual tool call closed that step's precondition. Measured on a fresh seed: 1×→S, 2×→A, 4×→A, 8×→B, baseline→F (14/14 — the real outcome).
- **Electron**: dev mode (`QALAA_URL`) and packaged mode (spawns `.next/standalone/server.js` via `ELECTRON_RUN_AS_NODE`, waits on `/api/health`) both verified on Windows with captured windows. macOS config in place: `titleBarStyle: "hiddenInset"`, traffic lights (18,18), vibrancy `under-window`.
- **Checks**: `npx tsc --noEmit` clean · `npm run lint` 0 errors / 0 warnings · `npm test` 30/30 (blind boundary clean, lint clean) · `npm run build` green, 30 API routes, all pages prerender.

## Not finished / left to build

### Demo-critical (would show live)
1. **macOS DMG build never ran.** `npm run desktop:build:mac` is configured (electron-builder, `asar:false`, `desktop/icon.png` from the brand logo) but was only dry-verified on Windows. First run on the Mac may need `xattr -cr release/` for Gatekeeper, and an unsigned `.app` opens via right-click → Open.
2. **LLM never exercised with a real key.** Settings → Agent brain presets (Groq/Gemini/etc.) + limiter + fallback are implemented and the deterministic engine covers everything, but no provider key was ever pasted — `Save & test` is the smoke test. Groq free tier is the recommended key (console.groq.com/keys).

### Real (post-demo) work
3. **No real server adapters.** `ServerAdapter` contract exists; `SimAdapter` mutates the simulated world. `SshAdapter` is a documented skeleton — zero real SSH/exec capability by design.
4. **No real message delivery.** iMessage-style UI is in-app only (decision made during build). Messages.app/osascript bridge and Twilio were spec'd as optional channels, not built.
5. **Single-org password auth only (optional), no multi-tenancy.** Single demo org ("Frontier Hub"). Auth is OFF by default; set `QALAA_AUTH_PASSWORD` or Settings → Access to gate the UI + every API route behind `/login` (`proxy.ts`, HttpOnly HMAC cookie, 12 h sliding, 5 failures/min/IP). See README "Optional: auth" and SPEC §7.1. There is one password, no users/roles/audit of logins, and the rate limiter is per-process memory — still bind localhost or put it behind TLS before exposing.
6. **Persistence is a JSON file** (`.data/`, gitignored). No database; `reset-demo` reseeds. Sufficient for the presentation.
7. **UI automated tests: none.** Coverage is server-side (range, policy, messaging, fleet, boundary). Lint is part of `npm test` (`eslint --max-warnings=0` runs after the blind-boundary check); `npm run lint:fix` auto-fixes.
8. **Deck print/PDF layout unverified** — slides render at window ratio; a dedicated `@media print` pass was planned, not done. For PDF export use the OS print dialog on fullscreen slides.
9. **Known rough edges** (fine for demo, polish items): agent detail live-log shows session events only, not persisted history; approvals sheet is functional but minimal; below-768px layouts only partially tuned (sidebar collapses; dense tables clip); "On the wire" feed timestamps are sim-clock.

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
SSO/RBAC + org model → real adapters (SSH/agent binary) → Postgres → message channels (Messages.app, Slack, Twilio) → range scenario packs (ransomware, insider, supply-chain) → scheduled conformance reports → notarized dmg/notarization pipeline + CI.
