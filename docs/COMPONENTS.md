# Components inventory

All UI in Outlaw is sourced from the designeer.xyz catalogs ([designeer.xyz/components](https://designeer.xyz/components) / [libraries.dev](https://libraries.dev)) — installed via shadcn-compatible registries where available, vendored from source repos otherwise. No hand-written UI components.

> Note: `lightpanda` has no Windows build, so fetching was done via the libraries' shadcn registries and `curl` from their GitHub repos.

## Install commands used

```bash
# shadcn/ui core + blocks
npx shadcn@latest init -d --yes
npx shadcn@latest add --yes --overwrite button badge dialog sheet tooltip dropdown-menu tabs scroll-area command table switch select popover separator input textarea avatar skeleton progress toggle-group sonner card breadcrumb collapsible hover-card slider resizable kbd chart spinner
npx shadcn@latest add --yes --overwrite sidebar-07 dashboard-01

# Magic UI — https://magicui.design/r/<name>.json
npx shadcn add https://magicui.design/r/{animated-list,animated-beam,number-ticker,flickering-grid,border-beam,globe,terminal,iphone,dot-pattern,marquee,shine-border,ripple,animated-grid-pattern,blur-fade,orbiting-circles,bento-grid,word-rotate,animated-shiny-text,safari}.json

# Motion Primitives — https://motion-primitives.com/c/<name>.json
npx shadcn add https://motion-primitives.com/c/{text-shimmer,sliding-number,in-view,glow-effect,border-trail,spotlight,animated-number,text-effect,progressive-blur,animated-background,text-loop,magnetic}.json

# Prompt Kit — https://www.prompt-kit.com/c/<name>.json
npx shadcn add https://www.prompt-kit.com/c/{prompt-input,message,loader,markdown,chat-container,scroll-button,reasoning,response-stream,prompt-suggestion}.json

# Aceternity UI — https://ui.aceternity.com/registry/<name>.json
npx shadcn add https://ui.aceternity.com/registry/{world-map,timeline,bento-grid,tracing-beam,glowing-effect,background-beams,sparkles,text-generate-effect,hover-border-gradient}.json

# Cult UI — site 429s on Windows IP; installed from the repo's static registry files
npx shadcn add https://raw.githubusercontent.com/nolly-studio/cult-ui/main/apps/www/public/r/{dynamic-island,text-animate,sortable-list}.json

# Kibo UI — https://www.kibo-ui.com/r/<name>.json
npx shadcn add https://www.kibo-ui.com/r/{status,relative-time,tags,ticker,spinner}.json

# React Bits — https://reactbits.dev/r/<Name>-TS-TW.json
npx shadcn add https://reactbits.dev/r/{Aurora,DotGrid,Dock,Particles}-TS-TW.json

# libraries.dev npm packages (MIT)
npm i border-beam thinking-orbs bot-avatars liquid-gooey voice-glow
```

## Inventory

| UI need | Library · component | Local path | License |
|---|---|---|---|
| Primitives (button, badge, dialog, sheet, tooltip, dropdown-menu, tabs, scroll-area, command, table, switch, select, popover, separator, input, textarea, avatar, skeleton, progress, toggle-group, sonner, card, breadcrumb, collapsible, hover-card, slider, resizable, kbd, spinner, label, checkbox, drawer, input-group, code-block, toggle) | shadcn/ui (base-nova, base-ui primitives) | `components/ui/*.tsx` | MIT |
| App shell sidebar | shadcn block `sidebar-07` | `components/ui/sidebar.tsx`, `components/app-sidebar.tsx`, `components/nav-*.tsx`, `components/team-switcher.tsx`, `hooks/use-mobile.ts` | MIT |
| Dashboard (section cards + area chart + data table) | shadcn block `dashboard-01` | `components/section-cards.tsx`, `components/chart-area-interactive.tsx`, `components/data-table.tsx`, `components/site-header.tsx`, `app/dashboard/page.tsx`, `app/dashboard/data.json` | MIT |
| Charts | shadcn `chart` (recharts wrapper) | `components/ui/chart.tsx` | MIT |
| KPI numbers | `@number-flow/react` | npm `0.6.2` | MIT |
| Animated list (feed/telemetry) | Magic UI `animated-list` | `components/ui/animated-list.tsx` | MIT |
| Beams between nodes | Magic UI `animated-beam` | `components/ui/animated-beam.tsx` | MIT |
| Count-up numbers | Magic UI `number-ticker` | `components/ui/number-ticker.tsx` | MIT |
| Grid/dot backgrounds | Magic UI `flickering-grid`, `dot-pattern`, `animated-grid-pattern` | `components/ui/flickering-grid.tsx`, `components/ui/dot-pattern.tsx`, `components/ui/animated-grid-pattern.tsx` | MIT |
| Border highlight | Magic UI `border-beam`, `shine-border`, `border-trail` (motion-primitives) | `components/ui/border-beam.tsx`, `components/ui/shine-border.tsx`, `components/ui/border-trail.tsx` | MIT |
| Globe | Magic UI `globe` (cobe) | `components/ui/globe.tsx` | MIT |
| Terminal | Magic UI `terminal` | `components/ui/terminal.tsx` | MIT |
| Device frames | Magic UI `iphone` (renamed from `iphone-15-pro`), `safari` | `components/ui/iphone.tsx`, `components/ui/safari.tsx` | MIT |
| Marquee / ripple / orbit | Magic UI `marquee`, `ripple`, `orbiting-circles` | `components/ui/marquee.tsx`, `components/ui/ripple.tsx`, `components/ui/orbiting-circles.tsx` | MIT |
| Reveal animations | Magic UI `blur-fade` | `components/ui/blur-fade.tsx` | MIT |
| Bento grids | Magic UI `bento-grid` + Aceternity `bento-grid` | Aceternity's (installed last) → `components/ui/bento-grid.tsx`; Magic UI's preserved at `components/vendor/magicui/bento-grid.tsx` (adapted: `asChild`→`buttonVariants` anchor for base-ui) | MIT |
| Rotating/shiny text | Magic UI `word-rotate`, `animated-shiny-text` | `components/ui/word-rotate.tsx`, `components/ui/animated-shiny-text.tsx` | MIT |
| Shimmer/loop/effect text | Motion Primitives `text-shimmer`, `text-effect`, `text-loop` | `components/ui/text-shimmer.tsx`, `components/ui/text-effect.tsx`, `components/ui/text-loop.tsx` | MIT |
| Animated digits | Motion Primitives `sliding-number`, `animated-number` | `components/ui/sliding-number.tsx`, `components/ui/animated-number.tsx` | MIT |
| Scroll reveal | Motion Primitives `in-view` | `components/ui/in-view.tsx` | MIT |
| Hover/spotlight effects | Motion Primitives `glow-effect`, `spotlight`, `magnetic` | `components/ui/glow-effect.tsx`, `components/ui/spotlight.tsx`, `components/ui/magnetic.tsx` | MIT |
| Blur/background anim | Motion Primitives `progressive-blur`, `animated-background` | `components/ui/progressive-blur.tsx`, `components/ui/animated-background.tsx` | MIT |
| Agent chat (iMessage-style channel) | Prompt Kit `prompt-input`, `message`, `loader`, `markdown`, `chat-container`, `scroll-button`, `reasoning`, `response-stream`, `prompt-suggestion` | `components/ui/prompt-input.tsx`, `message.tsx`, `loader.tsx`, `markdown.tsx`, `chat-container.tsx`, `scroll-button.tsx`, `reasoning.tsx`, `response-stream.tsx`, `prompt-suggestion.tsx` (+dep `code-block.tsx`) | MIT |
| iMessage chat bubbles | shadcn-chat (jakobhoeg; the MIT "Chat Bubble" listed on 21st.dev — direct 21st.dev install needs a paid API key, so vendored from source) | `components/vendor/shadcn-chat/{chat-bubble,chat-input,chat-message-list,expandable-chat,message-loading}.tsx`, `hooks/useAutoScroll.tsx` | MIT |
| World map (fleet geo) | Aceternity `world-map` (dotted-map) | `components/ui/world-map.tsx` | MIT (per aceternity.com) |
| Timeline / tracing | Aceternity `timeline`, `tracing-beam` | `components/ui/timeline.tsx`, `components/ui/tracing-beam.tsx` | MIT (per aceternity.com) |
| Card glow / beams / sparkles | Aceternity `glowing-effect`, `background-beams`, `sparkles`, `hover-border-gradient`, `text-generate-effect` | `components/ui/glowing-effect.tsx`, `background-beams.tsx`, `sparkles.tsx`, `hover-border-gradient.tsx`, `text-generate-effect.tsx` | MIT (per aceternity.com) |
| macOS-style notification island | Cult UI `dynamic-island` | `components/ui/dynamic-island.tsx` | MIT |
| Text animation | Cult UI `text-animate` | `components/ui/text-animate.tsx` | MIT |
| Sortable list | Cult UI `sortable-list` (dnd-kit, gsap) | `components/ui/sortable-list.tsx` | MIT |
| Status / relative time / tags / ticker / spinner | Kibo UI `status`, `relative-time`, `tags`, `ticker`, `spinner` | `components/kibo-ui/{status,relative-time,tags,ticker,spinner}/index.tsx` | MIT |
| Slide-deck backgrounds | React Bits `Aurora`, `Particles`, `DotGrid` (sub for removed `Squares`), `Dock` | `components/Aurora.tsx`, `components/Particles.tsx`, `components/DotGrid.tsx`, `components/Dock.tsx` | MIT + Commons Clause (no resale/redistribution of components themselves) |
| Agent avatars | libraries.dev `bot-avatars` | npm `0.1.1` | MIT |
| "Thinking" indicator | libraries.dev `thinking-orbs` | npm `0.3.2` | MIT |
| Border beam (pkg) | libraries.dev `border-beam` | npm `1.4.1` | MIT |
| Gooey merge effects | libraries.dev `liquid-gooey` | npm `0.2.2` | MIT |
| Voice-reactive glow | libraries.dev `voice-glow` | npm `0.2.1` | MIT |

Dropped / substituted:

- `Squares` (React Bits) — not in the current registry; substituted `DotGrid` (same interactive-grid family).
- `iphone-15-pro` (Magic UI) — renamed upstream to `iphone`.
- Cult UI installed via raw GitHub registry JSONs (site rate-limited this IP with HTTP 429).
- 21st.dev registry installs require an API key — the MIT component it lists (`shadcn-chat`) was vendored from `jakobhoeg/shadcn-chat` instead.
- Aceternity `sparkles` required `@tsparticles/*@^3` (registry pulled v4, whose API changed) — pinned to `^3.9.1`.

## libraries.dev prop vocabularies

### `bot-avatars` — `<BotAvatar />`

- `type`: `"clover" | "flower" | "triangle" | "square" | "blob" | "ghost" | "circle" | "drop" | "star" | "droid" | "mech" | "alien" | "hexagon" | "cat" | "cloud" | "pill" | "pebble" | "puddle"` — body shape, each with its own colour
- `face`: `"eyes"` (default) | `"mouth"`
- `state`: `"default" | "working" | "sleeping"`
- `size`: px or CSS length (default 64); `color`, `brightness` (0.5–1.5), `saturation` (0.5–1.5), `ink` (face colour)
- `speed` (multiplier), `paused`, `seed` (0–1 desync offset)
- `shading`: `"plastic"` (default) | `"crisp"` | `"smooth"` | `"flat"`; `shadow` (0.35), `highlight` (1.3), `light` (deg, 265), `depth` (0.65), `rim` (0.5), `spread` (1.55)
- `turn` (0–2 idle head turn), `interactive` (default true — pointer follow + click hop)
- Jump rig: `jumpHeight` (26), `jumpTime` (0.68), `jumpStretch` (1), `jumpSquash` (1.15), `jumpSquashTime` (0.37), `jumpSquashEase`, `jumpGroundTime` (0.11), `jumpGroundEase`, `jumpRiseTime` (0.33), `jumpRiseEase`, `jumpClickSquashTime` (0.24), `jumpSpin` (1), `jumpLean` (6), `jumpEvery` (8), `jumpLand` (0)
- `theme`: `"auto" | "dark" | "light"`; `whirl` + `whirlSize/Width/Length/Tilt` (spin motion ring)
- 2D canvas, no WebGL, respects prefers-reduced-motion, `role="img"`.

### `thinking-orbs` — `<ThinkingOrb />`

- `state`: `"working" | "searching" | "solving" | "listening" | "connecting" | "weaving" | "composing" | "breathing" | "shaping"`
- `size`: `64` (chat-avatar) or `20` (inline-text)
- `speed` (multiplier, default 1), `dark` (bool), `paused` (bool)

### `liquid-gooey` — `<Liquid>` + `<Liquid.Item>`

- `Liquid`: `blur` (goo softness), `contrast` (edge tightness), `fill`, `shadow`
- `Liquid.Item`: `effect` (`"morph" | "move" | "melt" | "bend"`), `x`, `y`, `transition`, `delay`

### `border-beam` — `<BorderBeam>`

- `size`: `"md" | "sm" | "line" | "pulse-inner" | "pulse-outside"`
- `colorVariant`: `"colorful" | "mono" | "ocean" | "sunset"`
- `strength` (0–1), `active` (bool), `theme` (`"light" | "dark"`)

### `voice-glow` — `<VoiceBeam>` + `useMicrophone()`

- `type`: `"default" | "pill" | "mobile"`
- `stream` (MediaStream, wins over `level`), `level` (0–1 or getter), `processing` (bool)
- `colorVariant`: `"colorful" | "mono" | "ocean" | "sunset" | "forest" | "candy" | "ice" | "gold"`
- `colors` (≤7 lobes), `bandColors: { core, above, mid, below }`
- `sensitivity`, `threshold`, `attack`, `release` (input chain); `reach`, `spread`, `flow`, `bend`, `idle` (shape)
- `theme`: `"dark" | "light" | "auto"`; `strength` (0–1), `active`, `paused`, `scale`
- Mic needs secure context + user gesture (`mic.start()`).
