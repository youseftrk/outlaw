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

`scripts/capture-demo.mjs` drives the real app (`QALAA_RESET=1 QALAA_DEMO_SHOW_CODE=1 npm run dev`
on `main`) through the lifecycle with real UI clicks on `/drill`, `/permissions`,
`/record` — refused → asked → owner says yes → one-time code → allowed → taken
back → refused → the record — and screencasts it to `assets/demo/lifecycle.webm`
(+ 12 keyframe PNGs). The composition uses the transcoded, seekable
`assets/demo/lifecycle.mp4` (54–104s).

```bash
node scripts/capture-demo.mjs assets/demo
ffmpeg -i assets/demo/lifecycle.webm -c:v libx264 -pix_fmt yuv420p -r 30 -an assets/demo/lifecycle.mp4
```

## Voice-over (Fish Audio)

```bash
FISH_AUDIO_API_KEY=... bash scripts/make-vo.sh   # one mp3 per caption line → audio/vo/line-NN.mp3
```

Model `s2.1-pro-free`, voice `f76b60630a174b36a15f4bd9ed6708f0`. The key is read from the
environment only and never written into the repo.

## Structure

- `index.html` — the whole composition (182 s, one paused GSAP root timeline)
- `assets/stamptype.js` — arlan.me/vault stamptype engine (canvas, tick-driven, seek-safe)
- `assets/demo/` — real-app lifecycle footage + keyframes
- `audio/` — Cuelume-synthesized cue WAVs + `vo/` Fish Audio narration clips
- `fonts/` — Space Grotesk + JetBrains Mono variable woff2 (OFL, local only)
- `assets/paper-shaders.js` — vendored `@paper-design/shaders` IIFE (GrainGradient, deterministic `setFrame`)
- `assets/gsap.min.js` — vendored GSAP 3.14.2 (no runtime network)
- `assets/brand/` — copied unmodified from `public/brand/`
- `scripts/` — render-cues, make-srt, capture-demo, make-vo
- `SCRIPT.md` — timed narration/on-screen lines + sources
- `CREDITS.md` — licenses for every third-party piece

## Determinism

No `Date.now()`, no `Math.random()`, no network at render time: GSAP + the
shader are vendored, fonts/audio are local files, and the GrainGradient is
driven by `mount.setFrame(t·1000)` from the timeline — a pure function of
playhead position.
