# Catalog survey — designeer.xyz/components + libraries.dev

Surveyed in-browser during the UI polish pass (Sept 2026). Every library listed on
https://designeer.xyz/components (126 entries at survey time) plus https://libraries.dev was opened;
component pages were browsed and each landing/registry/license page was captured by a
headless crawl (`catalog.json`, 125/126 reachable — Hexter UI DNS failed, Rare UI was inspected
manually because its site rate-limits automation). Palette target: Pantone greys/blacks with lime
(`#D0FF78`) and very light sky blue (`#99D6EA` / `#B5E3F1`) accents — see `docs/DESIGN.md`.

Legend: **Used** = vendored/installed in this pass · In use = already installed before · Skipped = reviewed, not a fit.

## Adopted this pass

| Library | Install | License | Used for |
|---|---|---|---|
| [Opensource UI](https://opensourceui.in/) | copy TypeScript source (no install) | MIT (attribution not required) | **Used**: `phone-mockup-card` → `components/ui/phone-mockup.tsx` (iPhone frame, graphite/titanium/black finishes); `text-loader` → `components/opensource-ui/text-loader.tsx` (research 'Searching' state). `spin-loader`/`apple-hello-loader` reviewed, not needed. |
| [Rare UI](https://rareui.com/) | `npx shadcn@latest add swamimalode07/rare-ui/<name>` or vendor from GitHub (site is behind a Vercel checkpoint for bots) | MIT + Commons Clause + Attribution (visible link to rareui.com required) | **Used**: `notification-bell` (header approvals) and `matrix-orb` (agent detail state) → `components/rare-ui/*` with LICENSE and a footer attribution link in the sidebar. Reviewed: task list, animated counter, folder, code block, step player, fluid orb, grid reveal, bounce/hook/proximity sidebars, scroll progress, gooey nav, duration picker, OTP input, delete button, emoji reaction, GitHub activity. |
| [Beautiful UI](https://beautifului.dev/) | copy code from site (no CLI); sources extracted from the page bundle | MIT (© 2026 Shane Levine) | **Used**: `LoadingState` (Drive/Dots/Orbit pixel-grid loader with shimmer label + elapsed timer) → `components/beautiful-ui/loading-state.tsx`, now the Suspense fallback / loading state on messages, governance, research, fleet, threat and agent pages. Surfer variant dropped (remote video). Reviewed: Thinking, Streaming Text, Approval Card, Tool Chips, Task Rows, Chat, Prompt Bar, Recommendation/Context/Insight cards, Diff/Records/Filter tables, Sidebar Nav, Search, Flowchart, Code Block, Fine-tune Card, Selection Actions, Agent Screen. |

## Full list

| Library | Install | License | Notes for a dark security agent-command-center |
|---|---|---|---|
| [Base UI](https://base-ui.com/) | npm `@base-ui/react` (already the Button/Tabs/Switch primitive layer) | MIT | In use. Keep as the accessibility/primitive layer under shadcn base-nova. |
| [ForgeUI](https://forgeui.in/) | copy-paste (site) | not stated on site | Marketing-oriented animated blocks; nothing needed beyond what Magic UI/Motion Primitives cover. |
| [shadcn/ui Components](https://ui.shadcn.com/) | `npx shadcn@latest add …` | MIT | In use (base-nova style). Sidebar, Sheet, Tooltip, Tabs, Switch, Sonner, Skeleton. |
| [Radix](https://www.radix-ui.com/) | npm `radix-ui` | MIT | Only via Rare UI/Kibo internals; Base UI is our primitive layer, so no direct use. |
| [21st.dev](https://21st.dev/) | registry needs paid API key | per component (mostly MIT) | Previews only; vendored MIT sources from GitHub instead (see COMPONENTS.md). |
| [React Bits](https://reactbits.dev/) | shadcn registry `https://reactbits.dev/r/<Name>-TS-TW` | MIT | In use: Dock, ShinyText, ClickSpark candidates. Dock kept for the collapsed roster idea; Spotlight variants too heavy for a data UI. |
| [Component Gallery](https://component.gallery/) | n/a (reference) | — | Design-system reference only; used to cross-check naming (Status/Badge/Toast). |
| [NumberFlow](https://number-flow.barvian.me/) | npm `@number-flow/react` | MIT | Alternative to `sliding-number`; not added — Motion Primitives SlidingNumber already in KPI cards and unread badge. |
| [Fancy Components](https://www.fancycomponents.dev/) | shadcn registry | MIT | Physics text/gravity effects — too playful for security KPIs; skipped. |
| [Opensource UI](https://opensourceui.in/) | copy TypeScript source (no install) | MIT (attribution not required) | **Used**: `phone-mockup-card` → `components/ui/phone-mockup.tsx` (iPhone frame, graphite/titanium/black finishes); `text-loader` → `components/opensource-ui/text-loader.tsx` (research 'Searching' state). `spin-loader`/`apple-hello-loader` reviewed, not needed. |
| [Amicro](https://amicro.vercel.app/) | npm | MIT | Micro-animation primitives overlap with Motion; skipped. |
| [Spectrum UI](https://ui.spectrumhq.in/) | copy-paste | MIT | SaaS blocks; nothing agent-dashboard specific. |
| [Bencho](https://bencho.dev/) | copy-paste | not stated | Physics blocks; skipped. |
| [shadcnblocks](https://www.shadcnblocks.com/) | paid | commercial | Skipped (paid). |
| [blocks.so](https://blocks.so/) | shadcn CLI | MIT | Landing blocks; skipped. |
| [RewampUI](https://www.rewampui.com/) | copy-paste | not stated | Showcase; skipped. |
| [Motion Primitives](https://motion-primitives.com/) | shadcn registry `https://motion-primitives.com/c/<name>.json` | MIT | In use heavily: AnimatedBackground (sidebar active pill, tabs), Magnetic (nav icons), BorderTrail (wordmark), SlidingNumber, TextEffect, GlowEffect, Dock-like tooltips. |
| [8bitcn](https://8bitcn.com/) | shadcn registry | MIT | Retro style clashes with Qalaa; skipped. |
| [Evil Charts](https://evilcharts.com/) | shadcn registry | MIT | Animated recharts wrappers — candidate for `/insights` later; kept Recharts + tokens for now. |
| [coss](https://coss.com/ui) | copy-paste (Base UI) | MIT | Base UI-based alternatives to shadcn; nothing beyond what base-nova gives. |
| [beUI](https://beui.dev/) | copy-paste | MIT | Animated Tailwind bits; skipped. |
| [Butter Nav](https://butter-nav.vercel.app/) | shadcn registry / npm | MIT | Fluid mega-menu; no mega-menu in Qalaa. |
| [Cult UI](https://www.cult-ui.com/) | shadcn registry `https://cult-ui.com/r/<name>.json` | MIT | In use (dynamic-island, texture-card, family-button ideas). Dynamic island kept for approval confirmation. |
| [daisyUI](https://daisyui.com/) | npm | MIT | Class library; would fight Tailwind tokens; skipped. |
| [HeroUI](https://www.heroui.com/) | npm | Apache 2.0 | Full library; skipped (would duplicate shadcn). |
| [Kibo UI](https://www.kibo-ui.com/) | shadcn registry `https://www.kibo-ui.com/r/<name>.json` | MIT | In use: Status (SSE health dot), RelativeTime (last event), Spinner variants, Marquee. |
| [Painterly](https://painterly.design-tools.workers.dev/) | copy-paste | not stated | Canvas paint loaders — visually heavy; skipped in favour of Beautiful UI pixel loader. |
| [Animate UI](https://animate-ui.com/) | shadcn registry | MIT | Motion variants of shadcn components; Tabs/Switch motion done in-place instead to keep base-nova API. |
| [Aceternity UI](https://ui.aceternity.com/) | shadcn registry `https://ui.aceternity.com/registry/<name>.json` | MIT | In use: hover-border-gradient (outline buttons), timeline (threat detail), world-map, glowing-effect. |
| [Magic UI](https://magicui.design/) | shadcn registry `https://magicui.design/r/<name>.json` | MIT | In use: BorderBeam (replay CTA), AnimatedList (wire feed), FlickeringGrid/DotPattern (empty states), NumberTicker, ShinyText, Ripple. |
| [TailGrids](https://tailgrids.com/) | copy-paste / paid | mixed | Skipped. |
| [Flowbite](https://flowbite.com/) | npm | MIT | Skipped (duplicate primitives). |
| [FlyonUI](https://flyonui.com/) | npm | MIT | Skipped. |
| [HyperUI](https://www.hyperui.dev/) | copy-paste | MIT | Marketing blocks; skipped. |
| [Preline UI](https://preline.co/) | npm | MIT + Preline license | Skipped. |
| [Float UI](https://floatui.com/) | copy-paste | MIT | Skipped. |
| [Meraki UI](https://merakiui.com/) | copy-paste | MIT | Skipped. |
| [Rare UI](https://rareui.com/) | `npx shadcn@latest add swamimalode07/rare-ui/<name>` or vendor from GitHub (site is behind a Vercel checkpoint for bots) | MIT + Commons Clause + Attribution (visible link to rareui.com required) | **Used**: `notification-bell` (header approvals) and `matrix-orb` (agent detail state) → `components/rare-ui/*` with LICENSE and a footer attribution link in the sidebar. Reviewed: task list, animated counter, folder, code block, step player, fluid orb, grid reveal, bounce/hook/proximity sidebars, scroll progress, gooey nav, duration picker, OTP input, delete button, emoji reaction, GitHub activity. |
| [Tremor](https://tremor.so/) | npm `@tremor/react` | Apache 2.0 | Dashboard charts; Recharts already in place; skipped. |
| [Base](https://basecn.dev/) | shadcn registry (basecn) | MIT | Base UI adaptations of shadcn — same as our base-nova; nothing extra. |
| [Easy UI](https://easyui.pro/) | copy-paste | MIT | Skipped. |
| [Eldora UI](https://eldoraui.site/) | shadcn registry | MIT | Landing-page motion; `blur-fade`-style already via Magic UI. |
| [Velora UI](https://velora.colorlib.com/) | copy-paste | MIT | Skipped. |
| [Hexter UI](https://hexter-ui.com/) | — | — | Site unreachable at survey time (DNS). |
| [Lightswind](https://lightswind.com/) | copy-paste | MIT | Glow/light effects — overlapping GlowEffect; skipped. |
| [Reverse UI](https://reverseui.com/) | copy-paste | not stated | Skipped. |
| [Smooth UI](https://smoothui.dev/) | shadcn registry / npm | MIT | Motion-heavy widgets; skipped. |
| [Tailark](https://tailark.com/) | copy-paste | MIT | Marketing sections; skipped. |
| [UI](https://ui-layouts.com/) | copy-paste (ui-layouts) | MIT | Full-page layouts; skipped. |
| [Kokonut UI](https://kokonutui.com/) | shadcn registry | MIT | AI input/cards — Prompt Kit already covers research composer. |
| [Watermelon UI](https://watermelon.sh/) | shadcn registry | MIT | Skipped. |
| [Nex UI](https://nexui.dev/) | npm | MIT | Skipped. |
| [Beautiful UI](https://beautifului.dev/) | copy code from site (no CLI); sources extracted from the page bundle | MIT (© 2026 Shane Levine) | **Used**: `LoadingState` (Drive/Dots/Orbit pixel-grid loader with shimmer label + elapsed timer) → `components/beautiful-ui/loading-state.tsx`, now the Suspense fallback / loading state on messages, governance, research, fleet, threat and agent pages. Surfer variant dropped (remote video). Reviewed: Thinking, Streaming Text, Approval Card, Tool Chips, Task Rows, Chat, Prompt Bar, Recommendation/Context/Insight cards, Diff/Records/Filter tables, Sidebar Nav, Search, Flowchart, Code Block, Fine-tune Card, Selection Actions, Agent Screen. |
| [Sera UI](https://seraui.com/) | shadcn CLI | MIT | Skipped. |
| [Syntax UI](https://syntaxui.com/) | copy-paste | MIT | Skipped (landing-page focus). |
| [shadcn-cssinjs](https://www.shadcn-cssinjs.com/) | copy-paste | MIT | Not applicable (Tailwind project). |
| [Transitions](https://transitions.dev/) | reference | — | Easing recipes consulted for the sidebar pill spring. |
| [23rd](https://23rd.dev/) | shadcn registry | MIT | Skipped. |
| [Oneko](https://oneko.dhrv.pw/) | script | MIT | Cursor cat — no. |
| [Rolling Number](https://rolling.kitlangton.dev/) | npm | MIT | Alternative to SlidingNumber; skipped. |
| [Ninja UI](https://ninna-ui.dev/) | copy-paste | MIT | Skipped. |
| [Annnimate](https://annnimate.com/) | npm (GSAP) | MIT | Would add GSAP; skipped. |
| [Scritto](https://scrit.to/) | npm | MIT | Rolling text; TextEffect covers it. |
| [Re UI](https://reui.io/) | shadcn registry | MIT (pro paid) | Base UI-based; skipped. |
| [ogimagecn](https://www.ogimagecn.com/) | registry | MIT | Not UI runtime. |
| [shieldcn](https://shieldcn.dev/) | registry | MIT | README badges; n/a. |
| [unlumen UI](https://ui.unlumen.com/) | npm | MIT | Skipped. |
| [Bearnie](https://bearnie.dev/) | copy-paste (Astro) | MIT | Not React. |
| [Fluid](https://www.fluidfunctionalism.com/) | copy-paste | not stated | Physics buttons; our Button motion done with Motion `whileTap` instead. |
| [termcn](https://termcn.dev/) | npm (Ink) | MIT | Terminal UI; n/a for web. |
| [framecn](https://framecn.dev/) | registry | MIT | Video; n/a. |
| [Dither Kit](https://www.tripwire.sh/dither-kit) | registry / npm | MIT | Dithered charts — off-brand. |
| [emailcn](https://emailcn.run/) | npm | MIT | Email; n/a. |
| [GetLayers](https://getlayers.ai/) | prompts | — | n/a. |
| [pdfcn](https://pdfcn.dev/) | registry | MIT | PDF; n/a. |
| [Shadcn Labs](https://www.shadcn-labs.com/) | index | — | Registry index; used to find BoardUI/Beautiful UI. |
| [Frameblox](https://frameblox.com/) | Framer | commercial | n/a. |
| [Nexvyn UI](https://ui.nexvyn.dev/) | copy-paste | MIT | Skipped. |
| [Gradient Spin](https://gradient-spin.vercel.app/) | npm `gradient-spin` | MIT | Reviewed; the Kibo Spinner 'ring' plus Beautiful UI loader cover spinner needs without a new dep. |
| [Libraries.dev UI](https://libraries.dev/) | npm `@libraries.dev/*` / shadcn registry | MIT | In use: `thinking-orbs` (roster + research), `bot-avatars`, `border-beam`, `liquid-gooey`, `voice-glow`. |
| [Sona UI](https://www.sonaui.com/) | npm | MIT | Skipped. |
| [Colorion](https://text-effects.colorion.co/) | copy-paste | MIT | Text effects; TextEffect covers. |
| [Dot Matrix](https://dotmatrix.zzzzshawn.cloud/) | shadcn registry | not stated (repo MIT) | 50+ dot-matrix loaders; the Beautiful UI 3×3 pixel grid gives the same language at 9 DOM nodes, so not added. |
| [SRCL](https://www.sacred.computer/) | copy-paste | MIT | DOS terminal kit — considered for `/range` log but off-brand. |
| [editorcn](https://editorcn.vercel.app/) | registry | MIT | Rich text; n/a. |
| [Prompt Kit](https://www.prompt-kit.com/) | shadcn registry `https://prompt-kit.com/c/<name>.json` | MIT | In use: PromptInput, Markdown, Loader (typing/text-shimmer) on `/research`. |
| [interior.dev](https://www.interior.dev/) | registry / npm | MIT | Click-responsiveness micro-interactions; principles applied to Button press timing. |
| [soundcn](https://soundcn.xyz/) | copy-paste | MIT | Sound effects; not added (silent dashboard). |
| [cuelume](https://cuelume.dev/) | npm | MIT | Sound; skipped. |
| [startercn shadcn/ui](https://startercn.vercel.app/) | template | MIT | n/a. |
| [Canvas UI](https://canvasui.dev/) | npm | MIT + Commons Clause | GPU liquid shaders — too heavy for 60fps target with SSE feed. |
| [Spell UI](https://spell.sh/) | copy-paste | not stated | Skipped. |
| [Skiper UI](https://skiper-ui.com/) | npm/registry | MIT | Skipped. |
| [devl](https://www.devl.dev/) | copy-paste | not stated | Skipped. |
| [Uiuno](https://uiuno.com/) | app | MIT | Tooling; n/a. |
| [Vengeance UI](https://www.vengeanceui.com/) | npm | MIT | Scroll interactions; n/a. |
| [sensory-ui](https://www.sensory-ui.com/) | registry | MIT | Sound; skipped. |
| [Amacro](https://amacro.vercel.app/) | npm | MIT | Page reveals; BlurFade used instead. |
| [Shoogle](https://shoogle.dev/) | search | — | Used to locate registries. |
| [Evil Buttons](https://www.evilbuttons.com/) | copy-paste | not stated | Tactile buttons reviewed; Button motion implemented with Motion (whileTap spring, sheen, ripple) to keep base-nova API. |
| [Great UI](https://www.great-ui.com/) | copy-paste | MIT | Skipped. |
| [Ruru UI](https://ui.ruru.build/) | npm | MIT | Skipped. |
| [Shadcn Studio](https://shadcnstudio.com/) | registry / paid | mixed | Skipped. |
| [Animated shadcn/ui](https://shadcn-animated.vercel.app/) | registry | MIT | Considered for Tabs/Switch; implemented in-place to preserve base-nova. |
| [Odyssey UI](https://www.odysseyui.com/) | registry | MIT | Skipped. |
| [Pin UI](https://www.pinui.xyz/) | copy-paste | MIT | Skipped. |
| [UICapsule](https://www.uicapsule.com/) | registry / npm | MIT | Skipped. |
| [Headless UI](https://headlessui.com/) | npm | MIT | Base UI already in place. |
| [Space UI](https://www.spaceui.one/) | copy-paste | MIT | Skipped. |
| [BoardUI](https://www.boardui.com/) | registry | MIT | Agentic dashboard blocks — close fit but restyled copies of shadcn; nothing beyond existing. |
| [Motion](https://motion.dev/) | npm `motion` | MIT | In use everywhere (whileTap, layout, AnimatePresence). |
| [GSAP](https://gsap.com/) | npm | standard license | Not added. |
| [Rive](https://rive.app/) | npm | commercial runtime | Not added. |
| [Componentry](https://componentry.dev/) | npm | MIT | Skipped. |
| [Lottie](https://lottiefiles.com/) | npm | MIT | Not added. |
| [Morphrig](https://morphrig.dev/) | reference | — | Icon morph reference for Approve → tick. |
| [loading.dev](https://loading.dev/) | npm `loading-dev`(react) | MIT (repo) | Reviewed all indicators; covered by Kibo Spinner + Prompt Kit Loader + Beautiful UI LoadingState without a new dep. |
| [Theatre.js](https://www.theatrejs.com/) | npm | Apache 2.0 | n/a. |
| [PaceUI](https://paceui.com/) | registry / paid | mixed | Skipped. |
| [glimm](https://glimm.dev/) | npm | MIT | Shader page transitions; skipped (perf). |
| [textmotion](https://textmotion.dev/) | npm | MIT | TextEffect covers. |
| [Bezel](https://bezel-ui.vercel.app/) | npm | MIT | Device bezels — reviewed as iPhone alternative; Opensource UI mockup chosen (pure Tailwind, MIT). |
| [Lotiqlab](https://lotiqlab.com/) | app | — | n/a. |
| [Easing Wizard](https://easingwizard.com/) | reference | — | Springs used for sidebar pill and button press. |
| [morphicons](https://www.morphicons.com/) | npm | MIT | Reviewed; Phosphor icons kept. |
| [Devouring Details](https://devouringdetails.com/) | book | — | Reference. |

## License notes

- **Rare UI** — `MIT + Commons Clause License Condition v1.0 + Attribution`, © 2026 Swami Malode.
  We keep the copyright notice (`components/rare-ui/LICENSE`, file headers) and a visible link to
  https://rareui.com in the sidebar footer. The components are not resold or redistributed on their own.
- **Beautiful UI** — MIT, © 2026 Shane Levine (https://beautifului.dev/license).
- **Opensource UI** — MIT, © bidyut10 (https://github.com/bidyut10/opensourceui); attribution optional, kept in file headers.
