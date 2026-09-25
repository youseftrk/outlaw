# Qalaa — Explainer Video (HyperFrames)

One switch that grants — and instantly takes back — an AI agent's power.

## Commands

```bash
# from this directory (Node 24 via `source ~/.nvm/nvm.sh`)
npx hyperframes lint         # static checks — must pass
npx hyperframes check        # lint + runtime + layout + motion + contrast — must pass
npx hyperframes snapshot --at 3,21,44,66,88,110   # key-frame PNGs → snapshots/
npx hyperframes render --output renders/qalaa-explainer.mp4  # 1920×1080 30fps MP4
```

## SFX — Cuelume → WAV (already rendered)

Cuelume (MIT) is the only SFX source. Its engine's `play()` needs a live
`AudioContext`, so `scripts/render-cues.mjs` replicates the exact engine graph
inside a page `OfflineAudioContext` in headless Chrome, feeds it the real
`RECIPES` data from `node_modules/cuelume`, and encodes stereo 16-bit WAV.

```bash
npm i cuelume puppeteer-core   # one-time
node scripts/render-cues.mjs   # → audio/*.wav (all 17 cues)
node scripts/render-cues.mjs toggle success error   # only these
```

Cue map: `toggle` = the switch flip · `success` = Allowed · `error` = Refused ·
`tick` = line reveals · `page` = list/record beats · `arrival`/`chime` = end card.

## Captions

Single source of truth = the `.cap` clip elements in `index.html`.
Regenerate the sidecar files after any copy/timing edit:

```bash
node scripts/make-srt.mjs    # → explainer.srt + explainer.vtt
```

## Live-demo capture

`scripts/capture-demo.mjs` screencasts the real app (`QALAA_RESET=1 npm run dev`
on the authority-pivot branch) through the lifecycle — pending approval →
approve → policy switch off → reject → traces — to `assets/demo/lifecycle.webm`.

```bash
node scripts/capture-demo.mjs [out-dir]
```

## Structure

- `index.html` — the whole composition (114 s, one paused GSAP root timeline)
- `audio/` — Cuelume-synthesized cue WAVs (+ `vo/` Fish Audio clips when funded)
- `fonts/` — Space Grotesk + JetBrains Mono variable woff2 (OFL, local only)
- `assets/paper-shaders.js` — vendored `@paper-design/shaders` IIFE (GrainGradient, deterministic `setFrame`)
- `assets/gsap.min.js` — vendored GSAP 3.14.2 (no runtime network)
- `assets/brand/` — copied unmodified from `public/brand/`
- `scripts/` — render-cues, make-srt, capture-demo
- `SCRIPT.md` — timed narration/on-screen lines + sources
- `CREDITS.md` — licenses for every third-party piece

## Determinism

No `Date.now()`, no `Math.random()`, no network at render time: GSAP + the
shader are vendored, fonts/audio are local files, and the GrainGradient is
driven by `mount.setFrame(t·1000)` from the timeline — a pure function of
playhead position.
