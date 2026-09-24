/**
 * Outlaw — Electron main process (SPEC §12).
 *
 * Dev:    OUTLAW_URL=http://localhost:3000 electron .
 * Packed: spawns .next/standalone/server.js on a free port, waits for
 *         /api/health, then loads it.
 *
 * Debug:  OUTLAW_SHOT=<path.png> captures the window ~4s after load and quits.
 *         (env var, not a flag — Chromium on Windows eats "/x" and URL-like
 *         positional args.)
 */
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

const DEV_URL = process.env.OUTLAW_URL || null;
const SHOT = process.env.OUTLAW_SHOT || null;

let serverProc = null;
let mainWin = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function standaloneDir() {
  // packaged: resources/app/.next/standalone ; dev fallback: <repo>/.next/standalone
  const packed = path.join(process.resourcesPath ?? "", "app", ".next", "standalone");
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, "..", ".next", "standalone");
}

async function standaloneUrl() {
  const dir = standaloneDir();
  const entry = path.join(dir, "server.js");
  if (!fs.existsSync(entry)) throw new Error(`standalone server not found at ${entry} — run npm run build && node scripts/prepare-standalone.mjs`);
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  // process.execPath is the Electron binary in a packaged app — run it as Node
  serverProc = spawn(process.execPath, [entry], {
    cwd: dir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(port), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProc.stderr?.on("data", (d) => console.error("[outlaw-server]", String(d).trim()));
  serverProc.on("exit", (code) => console.log(`[outlaw-server] exited ${code}`));
  const ok = await waitFor(`${url}/api/health`);
  if (!ok) throw new Error(`standalone server did not come up on ${url}`);
  return url;
}

async function createWindow() {
  const url = DEV_URL ?? (await standaloneUrl());
  const isMac = process.platform === "darwin";
  mainWin = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#040e17",
    title: "Outlaw",
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    ...(isMac ? { vibrancy: "under-window", visualEffectState: "active" } : { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.once("ready-to-show", () => mainWin.show());
  await mainWin.loadURL(url);
  if (SHOT) {
    setTimeout(async () => {
      try {
        const img = await mainWin.webContents.capturePage();
        fs.mkdirSync(path.dirname(SHOT), { recursive: true });
        fs.writeFileSync(SHOT, img.toPNG());
        console.log(`[outlaw] screenshot → ${SHOT}`);
      } catch (e) {
        console.error("[outlaw] screenshot failed:", e);
      } finally {
        app.quit();
      }
    }, 4000);
  }
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (e) {
    console.error("[outlaw] failed to start:", e);
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { try { serverProc?.kill(); } catch { /* noop */ } });
