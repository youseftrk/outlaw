// stamptype — port of the arlan.me/vault kinetic-type engine (open source,
// supplied by the owner). Canvas-driven, tick-based; the HyperFrames timeline
// calls draw(tick) directly — no RAF, no wall-clock, fully deterministic.
const TICK_MS = 50, STEP = 2, STAMP_TTL = 16, PARK_IN = 28, PARK_OUT = 76,
  PASS_END = 93, PARK_FRAMES = 48, PASS_OVERLAP = 12, FIELD_SWAP = 5;
const HEADLINE = 71 / 600, BAR_PAD_X = 10 / 600, BAR_PAD_TOP = 11 / 600,
  BAR_PAD_BOTTOM = 8 / 600, BAR_RADIUS = 11 / 600, BAR_STROKE = 16 / 600,
  LINE_RIGHT_MARGIN = 24 / 600, CONDENSE_MIN = 0.72;

const TRACKS = [
  [[1, 181, -100], [3, 181, 11], [6, 165, 16], [7, 128, 16], [10, 110, 16],
    [11, 72, 16], [13, 69, 38], [15, 70, 90], [16, 70, 94], [17, 97, 94],
    [19, 165, 94], [20, 170, 94], [21, 154, 94], [23, 117, 94], [24, 114, 94],
    [25, 114, 115], [27, 114, 168], [28, 114, 172], [76, 114, 172], [77, 114, 142],
    [79, 114, 66], [82, 96, 61], [84, 47, 61], [86, 108, 61], [88, 195, 61],
    [91, 195, -120]],
  [[12, -540, 273], [15, 16, 273], [18, 20, 267], [20, 20, 251], [22, 29, 251],
    [24, 53, 251], [28, 53, 240], [76, 53, 240], [80, 31, 240], [82, 31, 225],
    [84, 31, 184], [86, 0, 184], [88, 37, 264], [90, 76, 264], [93, -560, 264]],
  [[8, 640, 375], [11, 97, 375], [14, 90, 365], [15, 90, 343], [18, 85, 341],
    [19, 72, 341], [22, 71, 332], [24, 71, 308], [28, 49, 308], [76, 49, 308],
    [80, 49, 297], [84, 49, 319], [87, 49, 266], [88, 49, 264], [90, 88, 263],
    [93, 660, 263]],
  [[4, 620, 498], [7, 118, 498], [8, 104, 498], [12, 104, 487], [13, 77, 487],
    [15, 9, 487], [16, 4, 487], [17, 4, 469], [19, 4, 424], [22, 20, 420],
    [23, 58, 420], [26, 61, 408], [28, 61, 376], [76, 61, 376], [80, 31, 376],
    [83, 84, 376], [85, 63, 376], [87, 4, 376], [90, 0, 376], [93, -540, 376]],
];

const REF = 600;
const PARK_DELTA = PARK_FRAMES - (PARK_OUT - PARK_IN);
const PASS_FRAMES = PASS_END + PARK_DELTA;
const PASS_PITCH = PASS_FRAMES - PASS_OVERLAP;

function toTrack(f) {
  if (f <= PARK_IN) return f;
  if (f >= PARK_IN + PARK_FRAMES) return f - PARK_DELTA;
  return PARK_IN;
}
function posAt(track, f) {
  if (f < track[0][0] || f > track[track.length - 1][0]) return null;
  for (let i = 1; i < track.length; i++) {
    if (f <= track[i][0]) {
      const [f0, x0, y0] = track[i - 1];
      const [f1, x1, y1] = track[i];
      const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
  }
  return null;
}
const PARKED_X = TRACKS.map((t) => posAt(t, PARK_IN)?.[0] ?? 0);

class StampType {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ok = !!this.ctx;
    this.worlds = opts.worlds?.length ? opts.worlds : [];
    this.lines = this.worlds.map((w) => w.lines.map((text, i) => ({ text, track: i })));
    this.family = opts.family || "sans-serif";
    this.metrics = new Map();
    this.W = 0; this.H = 0; this.dpr = 1;
    if (this.ok) this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }
  measure(ctx, text, size, room = Infinity) {
    const key = `${size}|${room}|${text}`;
    const got = this.metrics.get(key);
    if (got) return got;
    ctx.font = `600 ${size * REF}px ${this.family}`;
    const m = ctx.measureText(text);
    const raw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const sx = raw > room ? Math.max(CONDENSE_MIN, room / raw) : 1;
    const met = { dx: m.actualBoundingBoxLeft * sx, asc: m.actualBoundingBoxAscent,
      w: raw * sx, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, sx };
    this.metrics.set(key, met);
    return met;
  }
  room(line) { return REF - PARKED_X[line.track] - LINE_RIGHT_MARGIN * REF; }
  lineMetrics(ctx, line) { return this.measure(ctx, line.text, HEADLINE, this.room(line)); }
  place(line, f) { return posAt(TRACKS[line.track], toTrack(f)); }
  text(ctx, str, size, x, y, m, stroke) {
    ctx.font = `600 ${size * REF}px ${this.family}`;
    if (m.sx === 1) {
      if (stroke) ctx.strokeText(str, x, y);
      ctx.fillText(str, x, y);
      return;
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(m.sx, 1);
    if (stroke) ctx.strokeText(str, 0, 0);
    ctx.fillText(str, 0, 0); ctx.restore();
  }
  silhouette(ctx, line, x, y, color) {
    const m = this.lineMetrics(ctx, line);
    const padX = BAR_PAD_X * REF, padT = BAR_PAD_TOP * REF, padB = BAR_PAD_BOTTOM * REF;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - padX, y - padT, m.w + padX * 2, m.h + padT + padB, BAR_RADIUS * REF);
    ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = BAR_STROKE * REF; ctx.lineJoin = "round";
    this.text(ctx, line.text, HEADLINE, x + m.dx, y + m.asc, m, true);
  }
  stamps(ctx, wi, f) {
    const world = this.worlds[wi], lines = this.lines[wi];
    const step0 = Math.floor(f / STEP) * STEP;
    for (let s = step0; s > f - STAMP_TTL; s -= STEP) {
      if (s < STEP) break;
      for (const line of lines) {
        const a = this.place(line, s - STEP), b = this.place(line, s);
        if (!a || !b) continue;
        if (Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5) continue;
        this.silhouette(ctx, line, a[0], a[1], world.bar);
      }
    }
  }
  live(ctx, wi, f) {
    const world = this.worlds[wi], placed = [];
    for (const line of this.lines[wi]) {
      const p = this.place(line, f);
      if (p) placed.push([line, p]);
    }
    for (const [line, p] of placed) this.silhouette(ctx, line, p[0], p[1], world.bar);
    ctx.fillStyle = world.ink;
    for (const [line, p] of placed) {
      const m = this.lineMetrics(ctx, line);
      this.text(ctx, line.text, HEADLINE, p[0] + m.dx, p[1] + m.asc, m, false);
    }
  }
  draw(tick) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { W, H } = this, k = H / REF, ox = (W - H) / 2, n = this.worlds.length;
    const wi = Math.floor(tick / PASS_PITCH) % n;
    const f = tick - Math.floor(tick / PASS_PITCH) * PASS_PITCH;
    const prev = (wi - 1 + n) % n, prevF = f + PASS_PITCH;
    const overlapping = prevF <= PASS_FRAMES;
    const fieldWorld = f < FIELD_SWAP && overlapping ? prev : wi;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.worlds[fieldWorld].bg;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(this.dpr * k, 0, 0, this.dpr * k, this.dpr * ox, 0);
    if (overlapping) this.stamps(ctx, prev, prevF);
    this.stamps(ctx, wi, f);
    if (overlapping) this.live(ctx, prev, prevF);
    this.live(ctx, wi, f);
  }
}
window.StampType = StampType;
window.STAMPTYPE = { TICK_MS, PASS_PITCH };
