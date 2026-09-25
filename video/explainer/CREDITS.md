# Credits

## Motion — arlan.me/vault (MIT)

Reproduced from Arlan Rakhmetzhanov's open-source motion vault
(https://arlan.me/vault, MIT — https://opensource.org/licenses/MIT), mechanisms
extracted from the published RSC source:

- **stamptype** — the hook (0–10s). The vault's kinetic-type poster engine
  ported verbatim to `assets/stamptype.js` (canvas; highlight bars fly in on
  axis-aligned jagged hops along the 4 breakpoint tracks, stamp trails live
  exactly 16 frames, worlds overlap 12 frames as the free transition, hard
  field swap at frame 5). Driven by the HyperFrames timeline: `draw(tick)` with
  `tick = floor(t × 20)`, so every frame is a pure function of time. Three
  worlds: lime bars on black → black bars on lime → refused-red bars on black.
- **color-depth** — the physical switch chrome (38–54s): layered
  radial-gradient body, `inset` bevel shadows, gloss top-light bar on the knob.
- **kinetic-type cascade** — word/line reveals land in power3 long-tail settles
  paced to the voice-over (problem, who, close).
- **waterfall stagger** — the four solve chips (38–54s), the demo ledger rows
  (91s), and the house-rules card (130–156s) cascade in reading order.
- **vector-editor** — the scope diagram (104–130s): selection chrome draws
  clockwise edge by edge, tightens onto the granted action, corner handles pop;
  a stray request slides into frame, snaps red, is refused and ejected.
- **ken-burns hold** — the record page (95–104s) holds on a slow scale drift
  while the ledger rows land.

## Sound — Cuelume (MIT)

https://cuelume.dev / npm `cuelume` — all 17 UI cues synthesized offline via
`scripts/render-cues.mjs` (engine graph reproduced verbatim inside an
OfflineAudioContext; committed WAVs are fixed thereafter). Only SFX source.

## Voice — Fish Audio

Narration generated with fish.audio TTS, model `s2.1-pro-free`, reference
voice `f76b60630a174b36a15f4bd9ed6708f0` (male, English) — one clip per caption
line (`audio/vo/line-NN.mp3`, `scripts/make-vo.sh`), mixed under the Cuelume
cues. Captions start exactly where each clip starts.

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
