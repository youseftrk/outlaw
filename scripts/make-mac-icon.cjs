/**
 * Build the desktop app icon from the brand mark (public/brand/logo.svg).
 *
 *   npx electron scripts/make-mac-icon.cjs
 *
 * Renders the mark on a macOS-style rounded dark tile at 1024x1024 in an
 * offscreen Electron window and writes desktop/icon.png. On macOS it then
 * emits the full iconset via sips + iconutil and writes desktop/icon.icns
 * (what electron-builder's `mac.icon` points at). Re-run when the mark changes.
 */
const { app, BrowserWindow } = require("electron");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const outPng = path.join(root, "desktop", "icon.png");
const outIcns = path.join(root, "desktop", "icon.icns");
const SIZE = 1024;

function html() {
  const svg = fs.readFileSync(path.join(root, "public", "brand", "logo.svg")).toString("base64");
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:${SIZE}px;height:${SIZE}px;background:transparent;overflow:hidden}
    .tile{position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:186px;
          background:radial-gradient(120% 120% at 30% 20%,#0c2a3a 0%,#040e17 65%);
          box-shadow:inset 0 0 0 2px rgba(97,231,219,.18)}
    .mark{position:absolute;left:212px;top:212px;width:600px;height:600px;
          background:url("data:image/svg+xml;base64,${svg}") center/contain no-repeat}
  </style></head><body><div class="tile"></div><div class="mark"></div></body></html>`;
}

function writeIcns() {
  const iconset = fs.mkdtempSync(path.join(os.tmpdir(), "qalaa-icon-")) + "/icon.iconset";
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const [suffix, px] of [["", size], ["@2x", size * 2]]) {
      execFileSync("sips", ["-z", String(px), String(px), outPng, "--out", path.join(iconset, `icon_${size}x${size}${suffix}.png`)], { stdio: "ignore" });
    }
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", outIcns]);
  fs.rmSync(path.dirname(iconset), { recursive: true, force: true });
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE, height: SIZE, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setZoomFactor(1);
  await win.loadURL("data:text/html;base64," + Buffer.from(html()).toString("base64"));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  fs.writeFileSync(outPng, img.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log(`make-mac-icon: wrote ${path.relative(root, outPng)} (${img.getSize().width}x${img.getSize().height})`);
  if (process.platform === "darwin") {
    writeIcns();
    console.log(`make-mac-icon: wrote ${path.relative(root, outIcns)}`);
  } else {
    console.log("make-mac-icon: not macOS — skipped .icns (needs sips/iconutil)");
  }
  app.quit();
}).catch((e) => { console.error("make-mac-icon failed:", e); app.exit(1); });
