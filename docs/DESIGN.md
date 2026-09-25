# Qalaa — design direction

Rule of the house: **no bespoke UI components.** Every visual element is a component sourced from the designeer.xyz / libraries.dev catalogs (inventory in `docs/COMPONENTS.md`), composed with Tailwind utilities and the tokens below. Pages are compositions, not inventions.

## 1. Brand tokens (`app/globals.css` → `@theme`)

| token | value | use |
|---|---|---|
| `--color-lime` | `#D0FF78` | the one accent: agent presence, primary action, agent message bubbles |
| `--color-cerulean` | `#99d6ea` | links, data series 1, operator bubbles |
| `--color-aqua` | `#71c5e8` | data series 2, focus ring |
| `--color-ocean` | `#333f48` | muted fills, chart areas, selected rows |
| `--color-carbon` | `#101820` | Pantone Black 6 C; text on lime and sky blue; deep surfaces |
| `--color-bg-0` | `#0c0e11` | page |
| `--color-bg-1` | `#14171a` | surface (cards) |
| `--color-bg-2` | `#1c2024` | raised / hover |
| `--color-bg-3` | `#25282a` | overlays, popovers |
| `--color-line` | `rgba(217, 217, 214, 0.08)` | hairlines (never solid gray borders) |
| `--color-line-strong` | `rgba(217, 217, 214, 0.16)` | focused hairlines |
| `--color-text-1` | `#f2f3f3` | primary text |
| `--color-text-2` | `#bbbcbc` | secondary |
| `--color-text-3` | `#75787b` | tertiary / placeholders |
| `--color-sev-info` | `#75787b` | severity scale (only place warm hues appear) |
| `--color-sev-low` | `#b5e3f1` | |
| `--color-sev-medium` | `#FFC857` | |
| `--color-sev-high` | `#FF9A5C` | |
| `--color-sev-critical` | `#FF5D6C` | |
| `--gradient-aura` | `radial-gradient(circle at 50% 50%, #71c5e8 0%, #a9e3f2 49%, #D0FFC8 100%)` | logo aura, active-agent halo |
| `--gradient-thermal` | layered radial teals over `#0c0e11` (see globals) | deck + hero backgrounds |
| `--radius-card` | `16px` (shell `18px`, inner `14px` — concentric) | cards |
| `--radius-bubble` | `18px` | message bubbles |
| `--shadow-ambient` | `0 24px 64px -32px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255,255,255,0.06)` | cards |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | reveals |
| `--ease-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` | interactive |

shadcn variables map: `--background: bg-0`, `--card: bg-1`, `--popover: bg-3`, `--primary: lime`, `--primary-foreground: carbon`, `--secondary: bg-2`, `--muted: bg-2`, `--muted-foreground: text-2`, `--accent: bg-2`, `--destructive: sev-critical`, `--border: line`, `--input: line-strong`, `--ring: aqua`, `--chart-1: cerulean`, `--chart-2: lime`, `--chart-3: aqua`, `--chart-4: ocean`, `--chart-5: sev-high`, `--sidebar: #0a0c0e`, `--sidebar-border: line`, `--sidebar-primary: lime`, `--sidebar-accent: bg-2`. Dark is the only theme (`<html class="dark">`).

Grain: fixed, pointer-events-none SVG `feTurbulence` overlay at `opacity: 0.035`, applied only on `/deck` and hero panels.

## 2. Type

- Display: **Instrument Serif** 400 + italic (`next/font/google`, `--font-display`). Page titles 30–36 px, tracking −0.01em; deck headlines 88–160 px; agent names on cards. Never for body or tables.
- UI: **Geist** 400/500/600 (`--font-sans`). Base 13.5 px in the app (dense), 15 px in deck body. Eyebrows: 11 px, uppercase, tracking 0.14em, `text-3`.
- Data: **Geist Mono** (`--font-mono`), `font-variant-numeric: tabular-nums`, for ids, IPs, hashes, times, and every KPI number.

## 3. Shell

`sidebar-07` (collapsible to icons) + `SidebarInset`. Header cell: `/brand/logo.svg` 28 px with aura glow + `/brand/wordmark.png` (height 18 px, inverted to text-1) — collapses to logo only. Nav (Phosphor icons, `weight="light"`, 18 px): Command center `/`, Agents `/agents`, Threats `/threats`, Fleet `/fleet`, Governance `/governance`, Messages `/messages` (unread lime badge), Research `/research`, Insights `/insights`, Range `/range`, Settings `/settings`. Footer: six `BotAvatar` micro (18 px) in a row with status — a living roster.

Top bar (h-14): `Breadcrumb`; right cluster: live pill (`Status` from Kibo: green "Live" when SSE connected, amber "Reconnecting"), `Kbd` ⌘K → `Command` palette (navigate, "Text Saqr…", director scenarios, start range), approvals bell (`Badge` count → `Sheet` inbox), operator `Avatar`.

Desktop (Electron, macOS): when `window.qalaa?.isDesktop && platform === "darwin"`, sidebar header gets `pt-9` for traffic lights and the top bar is `-webkit-app-region: drag` (buttons `no-drag`).

Motion: `BlurFade` for page/card entry (stagger 40 ms), `InView` for below-fold; `motion` layout animations on lists; reduced motion respected. No linear/ease-in-out anywhere.

Cards: shadcn `Card` restyled via tokens into a double bezel — outer `rounded-[18px] bg-white/[0.03] p-[3px] ring-1 ring-line`, inner `rounded-[14px] bg-bg-1 shadow-ambient`. Use `BorderBeam` only on the currently-active thing (running migration, active range run, agent acting).

## 4. Pages (composition maps)

### `/` Command center — bento (12 cols, gap 4)
```
┌────────────┬────────────┬────────────┬────────────┐
│ KPI        │ KPI        │ KPI        │ KPI        │   NumberFlow numbers, tiny recharts sparkline
├────────────┴────────────┴────────┬───┴────────────┤
│ Threat map (WorldMap, arcs origin│ Live feed      │   AnimatedList: BotAvatar 20px + text + mono time
│ → protected server; server dots  │ (AnimatedList) │
│ colored by status)         8/12  │          4/12  │
├──────────────┬───────────────────┼────────────────┤
│ Gang on duty │ Fleet conformance │ Needs you      │   avatars w/ states + ThinkingOrb when investigating;
│ (6 BotAvatar)│ (radial + list)   │ approvals+texts│   RadialBar avg + lowest 5 servers; approval cards
├──────────────┴───────────────────┼────────────────┤
│ Threat timeline (glowing Area)   │ Range (CTA /   │   detected / neutralized / prevented, 7d
│                             8/12 │ live run card) │   BorderBeam while running
└──────────────────────────────────┴────────────────┘
```
Copy: title "Command center" (display), eyebrow "Frontier Hub · 28 servers · 6 agents on watch".

### `/agents` + `/agents/[id]`
Grid 3 cols of agent cards: `BotAvatar` 96 px (type per agent: Saqr `star`, Hisn `triangle`, Athar `hexagon`, Miftah `flower`, Rahhal `square`, Bawwab `ghost`; state: acting→`working`, idle→`sleeping`, else `default`; `color` lime for orchestrator, cerulean others), name (display 28 px), callsign + role eyebrow, mandate, status `Status` chip, autonomy `Badge`, tools as small mono `Badge`s, activity sparkline, metrics row (mono). Detail: header (avatar + `ThinkingOrb` if investigating), `Tabs`: Live log (`Terminal` streaming action lines), Traces (rows → `Sheet` trace view), Messages, Servers. Controls: autonomy `ToggleGroup` (observe · recommend · act-with-approval · autonomous), pause `Switch`.

### `/threats` + `/threats/[id]`
Filters (`ToggleGroup` status · `Select` severity/category). `data-table` (dashboard-01): severity dot+label, title, category `Badge`, target hostnames (mono), handled-by avatar stack, status, `RelativeTime`. Detail: headline (display), summary, kill-chain `Timeline` (Aceternity) — each stage with outcome tag (observed / **blocked** / **prevented** in lime), IOC table (mono), governance traces list, messages sent, "attack map" mini `WorldMap`. Actions: Mark false positive · Escalate · Close.

### `/fleet` (Tabs: Servers · Migrations)
Servers: KPI strip (avg conformance, isolated, compromised, migrating) + table (hostname mono, role, region flag text, provider, status `Status`, conformance `Progress`, protected-by avatars) → `Sheet` detail: checks grouped by category (`Collapsible`), pass/warn/fail dots, "Fix now" → `POST conformance`, load sparkline, threats on this host, migrations. Migrations: cards with `AnimatedBeam` from source → target server node, step list with states, `Progress`, actions (dry-run · execute · rollback); "New migration" `Dialog` (source `Select`, target spec, reason, workloads).

### `/governance` (Tabs: Traces · Policies · Approvals)
Traces: filter by agent (avatars as `ToggleGroup`), verdict; list rows (intent, agent, risk `Progress` mini, verdict `Badge`, time) → detail panel: spans as vertical `Timeline`/`TracingBeam`; `policy` span shows the evaluation table; `tool` spans show input/output JSON in `Collapsible` mono; `llm` badge "Groq · gpt-oss-20b · 412 ms" or "Deterministic". Policies: rows with `Switch`, effect `Badge` (allow lime · deny critical · require-approval medium), priority, hits; editor `Dialog`. Approvals: inbox cards (agent avatar, tool, targets mono, risk) with Approve / Reject `Button`s; header `Button` "Export audit" (downloads JSON).

### `/messages` (+ `/phone` = phone only, full-bleed, for projecting)
Two panes: thread list (BotAvatar 40, name, `lastPreview`, `RelativeTime`, unread lime dot, pinned) · `Iphone15Pro` mockup (Magic UI) holding the conversation as children/`src` slot: iOS header (avatar, "Saqr", eyebrow "Qalaa · Agent"), day dividers, bubbles, typing indicator = `ThinkingOrb` size 20 inside a grey bubble, quick-reply chips (`Button` pill), input bar (`Input` + send icon). Bubble styles: agent = `bg-lime text-carbon rounded-[18px] rounded-bl-[6px]`; operator = `bg-gradient-to-b from-[#b5e3f1] to-cerulean text-carbon rounded-[18px] rounded-br-[6px]`; alerts add a left severity stripe; approval-request bubbles embed Approve/Reject `Button`s; attachments render as compact cards (threat/server/trace). Tapbacks: `HoverCard` → six emoji-free glyphs. Delivered/Read caption in mono 10 px.

### `/research`
Left: `ChatContainer` + `Message` + `PromptInput` (prompt-kit) — "Ask Athar"; `PromptSuggestion` chips ("Enrich 185.220.101.4", "CVE-2026-… registry token refresh", "Map lateral movement techniques"). Right: result — summary (`Markdown`), findings list with severity dots, IOC table, CVE `Card`s (cvss mono), ATT&CK technique `Badge`s, actors. KB browser `Tabs` (CVEs · Techniques · Actors) with search `Input`.

### `/insights`
`ToggleGroup` window 24h · 7d · 30d. KPI strip (NumberFlow). Charts (recharts via shadcn `chart`): by category (horizontal bars), by severity (stacked), timeline (glowing area). Agent leaderboard table (avatar, handled, actions, denials, messages). "What your agents protected": top servers list with threats blocked (mono) and role. Conformance average radial.

### `/range`
Header card: eyebrow "Blind cyber range", display title "Autonomous swarm vs. AI model hub — July 2026 replay", sources as links, baseline numbers. Controls: mode `ToggleGroup` (protected · baseline), speed `Slider` 1–8×, Start / Pause / Abort `Button`s. Live: 14-step kill chain as a horizontal stepper (`Timeline`-like row; pending grey, active `BorderBeam`, succeeded critical, blocked lime with the blocking agent avatar), two columns beneath: **Attacker view** (`Terminal`, labeled "operator-only — agents can't see this") · **Gang response** (AnimatedList of agent actions). End: score card (grade in display 96 px, time-to-detect, stages blocked, blast radius) + "vs. baseline" comparison and history table (compare protected vs baseline runs).

### `/settings`
LLM: provider `Select` (presets), base URL, model, API key (`Input type=password`, only "set" state shown), enable `Switch`, Test `Button` → result line; operator name/phone/org; sim speed `Slider`, quiet hours `Switch`; Desktop section shows platform + version.

### `/deck` — 14 slides, full-bleed, keyboard ← → , `F` fullscreen, `Esc` exit, dots progress, print = one slide per page
1 Title (aura logo, wordmark, tagline sign image) · 2 "The night of July 11" (incident, sources) · 3 The problem (machine-speed attackers, 6-day detection) · 4 Qalaa thesis · 5 Meet the garrison (6 avatars) · 6 How it works (`AnimatedBeam` diagram telemetry→Saqr→tools→governance→texts) · 7 Autonomous on servers · 8 Governance traces · 9 Texts, not tickets (phone mockup) · 10 The blind range · 11 Results (live numbers from last run) · 12 Security research · 13 Roadmap (real adapters, SIEM, iMessage/SMS, multi-tenant) · 14 Close.
Backgrounds alternate: thermal gradient + grain (React Bits `Aurora`/Magic UI `FlickeringGrid` at low opacity), lime sign panels (`liquid-gooey` merging blocks) with carbon serif text. Headlines Instrument Serif; body Geist 22 px; footer mono "qalaa · 2026".

## 5. Copy voice
Sentence case. Plain verbs. Buttons say what happens ("Approve rebuild", not "Submit"). Agents write in first person, short, like a competent colleague: "Locked pkg-cache-01's registry — someone minted an admin token without a session. Athar is pulling evidence." Errors say what happened and what to do. Empty states invite action ("No approvals waiting. The garrison is running autonomously.").
