/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * QA helper: render routes in a hidden Electron window and save PNG screenshots.
 *
 *   SHOT_OUT=.shots SHOT_BASE=http://localhost:3000 electron scripts/screenshot.cjs home agents "range?x=1"
 *
 * Routes are passed WITHOUT the leading slash and the base URL via env — Electron/Chromium on
 * Windows mangle "/x" and URL-looking positional args. Waits WAIT_MS (default 9000) per route.
 */
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const outDir = path.resolve(process.env.SHOT_OUT || ".shots");
const base = process.env.SHOT_BASE || "http://localhost:3000";
const routes = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const WAIT_MS = Number(process.env.WAIT_MS || 9000);
const W = Number(process.env.SHOT_W || 1600);
const H = Number(process.env.SHOT_H || 1000);
const t0 = Date.now();
const log = (...a) => console.log(`[shot ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.on("console-message", (event) => {
    const { level, message } = event;
    if (level === "error" || level === "warning" || level >= 2) log(`console[${level}]`, String(message).slice(0, 300));
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => log("did-fail-load", code, desc, url));

  for (const raw of routes.length ? routes : ["home"]) {
    const route = raw === "home" ? "/" : "/" + raw.replace(/^\/+/, "");
    const url = base + route;
    log("load", url);
    win.loadURL(url).catch((e) => log("loadURL rejected", e.message));
    await new Promise((r) => setTimeout(r, WAIT_MS));
    try {
      const img = await win.webContents.capturePage();
      const name = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "home";
      const file = path.join(outDir, `${name}.png`);
      fs.writeFileSync(file, img.toPNG());
      log("saved", file, JSON.stringify(img.getSize()));
    } catch (e) {
      log("capture failed", e.message);
    }
  }
  app.quit();
});
