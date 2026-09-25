// Record the live Qalaa authority lifecycle to assets/demo/*.webm via puppeteer
// screencast. Requires the app at localhost:3000 (QALAA_RESET=1
// QALAA_DEMO_SHOW_CODE=1 npm run dev). Beats: refused → ask → owner yes →
// one-time code → allowed → take back → refused → the record.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const APP = "http://localhost:3000";
const OUT = new URL("../assets/demo/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const CHROME = "/home/ubuntu/.local/bin/google-chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars",
    "--window-size=1920,1080", "--force-device-scale-factor=1"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

async function clickText(sel, text) {
  return page.evaluate((s, t) => {
    const els = [...document.querySelectorAll(s)];
    const el = els.find((e) => e.textContent.trim().toLowerCase().includes(t.toLowerCase()) && !e.disabled);
    if (el) { el.scrollIntoView({ block: "center" }); el.click(); return el.textContent.trim(); }
    return null;
  }, sel, text);
}

const reset = await fetch(`${APP}/api/authority/reset`, { method: "POST" }).then((r) => r.status);
console.log("reset", reset);

await page.goto(`${APP}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
await sleep(1500);
const rec = await page.screencast({ path: `${OUT}lifecycle.webm`, speed: 1 });
const beats = [];
const beat = (n) => { beats.push({ name: n, t: Date.now() }); console.log("beat", n); };
const t0 = Date.now();
const shot = async (n) => page.screenshot({ path: `${OUT}shot-${n}.png` });

// 1. the door — refused
await page.goto(`${APP}/drill`, { waitUntil: "domcontentloaded" });
await sleep(1800);
await shot("01-door-refused");
console.log("try:", await clickText("button", "Try it"));
await sleep(2600); await shot("02-refused-result"); beat("refused");

// 2. ask
console.log("ask:", await clickText("button", "Ask "));
await sleep(2600); await shot("03-asked"); beat("asked");

// 3. owner says yes
await page.goto(`${APP}/permissions`, { waitUntil: "domcontentloaded" });
await sleep(1800); await shot("04-owner-desk");
console.log("yes:", await clickText("button", "Yes, allow it"));
await sleep(2600); await shot("05-accepted"); beat("accepted");

// 4. one-time code — UI shows the issued code in demo mode
const issued = await page.evaluate(() => {
  const s = [...document.querySelectorAll("span.mono-data")].map((e) => e.textContent.trim()).find((t) => /^\d{4,6}$/.test(t));
  return s || null;
});
console.log("issued code:", issued);
if (issued) {
  await page.type('input[placeholder="6-digit code"]', issued, { delay: 90 });
  await shot("06-code-typed");
  await clickText("button[type=submit]", "");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("form button")].find((x) => !x.disabled);
    b?.click();
  });
  await sleep(2600); await shot("07-permission-on"); beat("code");
}

// 5. same door — allowed
await page.goto(`${APP}/drill`, { waitUntil: "domcontentloaded" });
await sleep(1800);
await clickText("button", "Try it");
await sleep(2600); await shot("08-allowed"); beat("allowed");

// 6. take it back — owner switch on the permissions card
await page.goto(`${APP}/permissions`, { waitUntil: "domcontentloaded" });
await sleep(1800);
const flipped = await page.evaluate(() => {
  const sw = document.querySelector('[aria-label="Take this permission back"]');
  if (sw) { sw.scrollIntoView({ block: "center" }); sw.click(); return true; }
  return false;
});
await sleep(1200);
const confirmed = await clickText("button", "Take it back") || await clickText("button", "Revoke") || await clickText("button", "confirm");
console.log("revoke:", flipped, confirmed);
await sleep(2600); await shot("09-revoked"); beat("revoked");

// 7. very next attempt — refused again
await page.goto(`${APP}/drill`, { waitUntil: "domcontentloaded" });
await sleep(1800);
await clickText("button", "Try it");
await sleep(2600); await shot("10-refused-again"); beat("refused2");

// 8. the record
await page.goto(`${APP}/record`, { waitUntil: "domcontentloaded" });
await sleep(2400); await shot("11-record"); beat("record");
await page.evaluate(() => window.scrollTo({ top: 500, behavior: "smooth" }));
await sleep(2200); await shot("12-record-scroll");

await rec.stop();
const total = ((Date.now() - t0) / 1000).toFixed(1);
const start = beats[0]?.t ?? t0;
for (const b of beats) console.log(`${b.name}@${((b.t - start) / 1000).toFixed(1)}s`);
console.log("total", total, "s →", OUT);
await browser.close();
