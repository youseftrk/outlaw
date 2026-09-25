#!/usr/bin/env node
// render-cues.mjs — bake Cuelume UI cues to WAV for deterministic HyperFrames mixing.
//
//   node scripts/render-cues.mjs [--out ./audio] [name ...]
//
// How: cuelume (MIT, https://github.com/Danilaa1/cuelume) synthesizes its 17 cues
// live on a Web Audio graph. We replay the exact recipes (imported from
// cuelume/dist/sounds/recipes.js) through an OfflineAudioContext in headless
// Chrome (system google-chrome via puppeteer-core), using the library's own
// render-graph code, and encode the rendered AudioBuffer as 16-bit PCM WAV.
// Note: the 'noise' layers use Math.random() inside the recipe — WAVs are
// therefore identical in envelope but differ in noise grains between runs.
// Commit the rendered files; do not re-render per build.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const outDir = resolve(projectRoot, flag("out", "audio"));
const chromePath =
  process.env.CHROME_PATH || "/home/ubuntu/.local/bin/google-chrome";

// Cuelume recipe table — the recipe data drives the identical Web Audio graph.
const recipesUrl = pathToFileURL(
  resolve(projectRoot, "node_modules/cuelume/dist/sounds/recipes.js"),
).href;
const { RECIPES } = await import(recipesUrl);

const wanted = argv.filter((a) => !a.startsWith("--"));
const names = wanted.length ? wanted : Object.keys(RECIPES);
const unknown = names.filter((n) => !RECIPES[n]);
if (unknown.length) {
  console.error(`unknown cue(s): ${unknown.join(", ")}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();

// Render one cue in an OfflineAudioContext using Cuelume's engine graph
// (copied verbatim from cuelume/dist/audio/engine.js, MIT, adapted only to
// offline rendering: the destination is the offline context's own).
const wavB64 = await page.evaluate(async (recipeJson) => {
  const recipe = JSON.parse(recipeJson);
  const SOURCE_STOP_PADDING = 0.05;
  const INAUDIBLE_GAIN = 0.001;
  const OUTPUT_GAIN = 4;

  function sourceEnd(r) {
    return Math.max(
      ...r.layers.map(
        (l) => (l.offset ?? 0) + l.attack + l.decay + SOURCE_STOP_PADDING,
      ),
    );
  }
  function shimmerTail(s) {
    if (!s || s.feedback <= 0) return 0;
    if (s.feedback >= 1) return s.delay;
    return (
      s.delay * (1 + Math.ceil(Math.log(INAUDIBLE_GAIN) / Math.log(s.feedback)))
    );
  }

  const sr = 48000;
  const total = sourceEnd(recipe) + shimmerTail(recipe.shimmer) + 0.35;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);

  const output = ctx.createGain();
  output.gain.value = OUTPUT_GAIN;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;
  output.connect(limiter).connect(ctx.destination);

  function renderTone(master, layer, t) {
    const osc = ctx.createOscillator();
    osc.type = layer.waveform;
    osc.frequency.setValueAtTime(layer.frequency, t);
    if (layer.detune) osc.detune.value = layer.detune;
    if (layer.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        layer.glideTo,
        t + (layer.glideTime ?? layer.attack + layer.decay),
      );
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(layer.peak, t + layer.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + layer.attack + layer.decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + layer.attack + layer.decay + SOURCE_STOP_PADDING);
  }
  function renderNoise(master, layer, t) {
    const dur = layer.attack + layer.decay + SOURCE_STOP_PADDING;
    const len = Math.max(1, Math.floor(dur * ctx.sampleRate));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = 2 * Math.random() - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = layer.filterType;
    f.frequency.value = layer.filterFrequency;
    if (layer.filterQ !== undefined) f.Q.value = layer.filterQ;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(layer.peak, t + layer.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + layer.attack + layer.decay);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }
  function attachShimmer(source, shimmer) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = shimmer.delay;
    const fb = ctx.createBiquadFilter();
    fb.type = "lowpass";
    fb.frequency.value = shimmer.lowpass;
    const fbGain = ctx.createGain();
    fbGain.gain.value = shimmer.feedback;
    const wet = ctx.createGain();
    wet.gain.value = shimmer.wet;
    source.connect(delay);
    delay.connect(fb);
    fb.connect(fbGain);
    fbGain.connect(delay);
    fb.connect(wet);
    wet.connect(output);
  }

  const master = ctx.createGain();
  master.gain.value = recipe.masterGain;
  master.connect(output);
  if (recipe.shimmer) attachShimmer(master, recipe.shimmer);
  for (const layer of recipe.layers) {
    const t = ctx.currentTime + (layer.offset ?? 0);
    if (layer.kind === "tone") renderTone(master, layer, t);
    else renderNoise(master, layer, t);
  }

  const buf = await ctx.startRendering();
  // Encode stereo interleaved 16-bit PCM WAV.
  const ch = buf.numberOfChannels;
  const frames = buf.length;
  const pcm = new DataView(new ArrayBuffer(44 + frames * ch * 2));
  const w = (o, s) => {
    for (let i = 0; i < s.length; i++) pcm.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  pcm.setUint32(4, 36 + frames * ch * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  pcm.setUint32(16, 16, true);
  pcm.setUint16(20, 1, true);
  pcm.setUint16(22, ch, true);
  pcm.setUint32(24, sr, true);
  pcm.setUint32(28, sr * ch * 2, true);
  pcm.setUint16(32, ch * 2, true);
  pcm.setUint16(34, 16, true);
  w(36, "data");
  pcm.setUint32(40, frames * ch * 2, true);
  let off = 44;
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      pcm.setInt16(off, v * 32767, true);
      off += 2;
    }
  }
  const bytes = new Uint8Array(pcm.buffer);
  let b64 = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK)
    b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(b64);
}, JSON.stringify(RECIPES[names[0]]));

// loop per name (one page, fresh context per sound)
async function renderOne(name) {
  const r = RECIPES[name];
  const b64 = await page.evaluate(async (recipeJson) => {
    const recipe = JSON.parse(recipeJson);
    const SOURCE_STOP_PADDING = 0.05;
    const INAUDIBLE_GAIN = 0.001;
    const OUTPUT_GAIN = 4;
    function sourceEnd(r) {
      return Math.max(
        ...r.layers.map(
          (l) => (l.offset ?? 0) + l.attack + l.decay + SOURCE_STOP_PADDING,
        ),
      );
    }
    function shimmerTail(s) {
      if (!s || s.feedback <= 0) return 0;
      if (s.feedback >= 1) return s.delay;
      return (
        s.delay *
        (1 + Math.ceil(Math.log(INAUDIBLE_GAIN) / Math.log(s.feedback)))
      );
    }
    const sr = 48000;
    const total = sourceEnd(recipe) + shimmerTail(recipe.shimmer) + 0.35;
    const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    const output = ctx.createGain();
    output.gain.value = OUTPUT_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    output.connect(limiter).connect(ctx.destination);
    function renderTone(master, layer, t) {
      const osc = ctx.createOscillator();
      osc.type = layer.waveform;
      osc.frequency.setValueAtTime(layer.frequency, t);
      if (layer.detune) osc.detune.value = layer.detune;
      if (layer.glideTo !== undefined)
        osc.frequency.exponentialRampToValueAtTime(
          layer.glideTo,
          t + (layer.glideTime ?? layer.attack + layer.decay),
        );
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(layer.peak, t + layer.attack);
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        t + layer.attack + layer.decay,
      );
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + layer.attack + layer.decay + SOURCE_STOP_PADDING);
    }
    function renderNoise(master, layer, t) {
      const dur = layer.attack + layer.decay + SOURCE_STOP_PADDING;
      const len = Math.max(1, Math.floor(dur * ctx.sampleRate));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = 2 * Math.random() - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = layer.filterType;
      f.frequency.value = layer.filterFrequency;
      if (layer.filterQ !== undefined) f.Q.value = layer.filterQ;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(layer.peak, t + layer.attack);
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        t + layer.attack + layer.decay,
      );
      src.connect(f).connect(g).connect(master);
      src.start(t);
      src.stop(t + dur);
    }
    function attachShimmer(source, shimmer) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = shimmer.delay;
      const fb = ctx.createBiquadFilter();
      fb.type = "lowpass";
      fb.frequency.value = shimmer.lowpass;
      const fbGain = ctx.createGain();
      fbGain.gain.value = shimmer.feedback;
      const wet = ctx.createGain();
      wet.gain.value = shimmer.wet;
      source.connect(delay);
      delay.connect(fb);
      fb.connect(fbGain);
      fbGain.connect(delay);
      fb.connect(wet);
      wet.connect(output);
    }
    const master = ctx.createGain();
    master.gain.value = recipe.masterGain;
    master.connect(output);
    if (recipe.shimmer) attachShimmer(master, recipe.shimmer);
    for (const layer of recipe.layers) {
      const t = ctx.currentTime + (layer.offset ?? 0);
      if (layer.kind === "tone") renderTone(master, layer, t);
      else renderNoise(master, layer, t);
    }
    const buf = await ctx.startRendering();
    const ch = buf.numberOfChannels;
    const frames = buf.length;
    const pcm = new DataView(new ArrayBuffer(44 + frames * ch * 2));
    const w = (o, s) => {
      for (let i = 0; i < s.length; i++) pcm.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, "RIFF");
    pcm.setUint32(4, 36 + frames * ch * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    pcm.setUint32(16, 16, true);
    pcm.setUint16(20, 1, true);
    pcm.setUint16(22, ch, true);
    pcm.setUint32(24, sr, true);
    pcm.setUint32(28, sr * ch * 2, true);
    pcm.setUint16(32, ch * 2, true);
    pcm.setUint16(34, 16, true);
    w(36, "data");
    pcm.setUint32(40, frames * ch * 2, true);
    let off = 44;
    const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) {
        const v = Math.max(-1, Math.min(1, chans[c][i]));
        pcm.setInt16(off, v * 32767, true);
        off += 2;
      }
    }
    const bytes = new Uint8Array(pcm.buffer);
    let b64 = "";
    for (let i = 0; i < bytes.length; i += 8192)
      b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(b64);
  }, JSON.stringify(r));
  const file = join(outDir, `${name}.wav`);
  writeFileSync(file, Buffer.from(b64, "base64"));
  return file;
}

for (const name of names) {
  const f = await renderOne(name);
  console.log(`${name} -> ${f}`);
}
await browser.close();
