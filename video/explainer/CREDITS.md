# Credits

## Motion — arlan.me/vault (MIT)

Reproduced from Arlan Rakhmetzhanov's open-source motion vault
(https://arlan.me/vault, MIT — https://opensource.org/licenses/MIT), mechanisms
extracted from the published RSC source:

- **color-depth** — the physical switch chrome (S3): layered radial-gradient
  body, `inset` bevel shadows, gloss top-light bar on the knob.
- **kinetic-type cascade** — word/line reveals land in power3 long-tail settles
  paced to the voice-over (all title scenes).
- **waterfall stagger** — the five-step rows (S4) and the four solve chips (S3)
  cascade in reading order.
- **vector-editor** — planned for drop 2's scope diagram (selection chrome +
  corner handles, DOM).
- **ghosty-reveal** — planned for drop 2 (feathered mask-position bleed on the
  record ledger + wordmark).
- **typer** — planned for drop 2 (per-char wave flicker settling into bars on
  the permission-request card fields).
- **kinetic-typography** — planned for drop 2 (canvas tile-ripple on "stop").

## Sound — Cuelume (MIT)

https://cuelume.dev / npm `cuelume` — all 17 UI cues synthesized offline via
`scripts/render-cues.mjs` (engine graph reproduced verbatim inside an
OfflineAudioContext; committed WAVs are fixed thereafter). Only SFX source.

## Voice — Fish Audio

Narration to be generated with fish.audio TTS (male, English), one clip per
script line, mixed under the Cuelume cues. Blocked at production time:
account `402 insufficient_balance`.

## Shader — @paper-design/shaders (Apache-2.0)

GrainGradient, wave shape, `colors ["#97ff52","#3d3d38","#262622"]`,
`colorBack #0a0a0a`, `softness 0.7`, `intensity 0.15`, `noise 0.5` — vendored as
`assets/paper-shaders.js`, driven deterministically via `mount.setFrame`.

## Fonts (SIL OFL 1.1)

- **Space Grotesk** (variable, Fontsource CDN woff2 → `fonts/space-grotesk-vf.woff2`)
- **JetBrains Mono** (variable, → `fonts/jetbrains-mono-vf.woff2`)

## GSAP 3.14.2

Standard license (free for this use), vendored as `assets/gsap.min.js` — no CDN
at render time.

## Brand

`assets/brand/*` copied unmodified from the repo's `public/brand/`.
