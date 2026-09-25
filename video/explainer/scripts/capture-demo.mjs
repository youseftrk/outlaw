// Capture the live Qalaa app lifecycle to webm for the explainer video.
// Usage: node scripts/capture-demo.mjs [out-dir]
// Requires the dev server running on :3000 (QALAA_RESET=1 npm run dev).
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "http://localhost:3000";
const OUT = resolve(process.argv[2] ?? "assets/demo");
const CHROME = process.env.CHROME_PATH ?? "/home/ubuntu/.local/bin/google-chrome";

mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[capture ${(performance.now() / 1000).toFixed(1)}s] ${m}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--window-size=1920,1080", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();

const api = async (path, init) => {
  const r = await fetch(`${BASE}${path}`, init);
  return r.json();
};
const post = (path, body) =>
  api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function waitFor(pred, label, timeoutMs = 90000, every = 750) {
  const t0 = Date.now();
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting: ${label}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

// ---- record: full lifecycle in one take ----
const take = resolve(OUT, "lifecycle.webm");
const rec = await page.screencast({ path: take, speed: 1 });
log("recording → lifecycle.webm");

await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3500)); // dashboard settles

// trigger an incident that drives an agent toward a gated action
await post("/api/director", { scenario: "leaked-token" });
log("director: leaked-token injected");

let approval = await waitFor(async () => {
  const d = await api("/api/governance/approvals");
  const list = d.approvals ?? d;
  return (list ?? []).find((a) => a.status === "pending");
}, "pending approval", 120000, 1000);
log(`approval pending: ${approval.id} — ${approval.summary}`);

// approvals tab: the ask, then the human says yes
await page.goto(`${BASE}/governance?tab=approvals`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => document.querySelector("main")?.scrollIntoView());
await new Promise((r) => setTimeout(r, 1200));

const approved = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().includes("Approve"));
  if (!btn) return false;
  btn.click();
  return true;
});
log(`clicked approve: ${approved}`);
await new Promise((r) => setTimeout(r, 2500));

// the record: traces
await page.goto(`${BASE}/governance?tab=traces`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 4000));

// policies: the switch — toggle one off (take power back)
await page.goto(`${BASE}/governance?tab=policies`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const sw = document.querySelector('button[role="switch"][aria-checked="true"]') ??
    document.querySelector('button[role="switch"]');
  sw?.scrollIntoView({ block: "center" });
  sw?.click();
});
log("toggled a policy switch");
await new Promise((r) => setTimeout(r, 2500));

// second incident → second ask → owner refuses
await post("/api/director", { scenario: "exfil" });
log("director: exfil injected");
approval = await waitFor(async () => {
  const d = await api("/api/governance/approvals");
  const list = d.approvals ?? d;
  return (list ?? []).find((a) => a.status === "pending");
}, "second pending approval", 120000, 1000);
log(`approval pending: ${approval.id} — ${approval.summary}`);

await page.goto(`${BASE}/governance?tab=approvals`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().includes("Reject"));
  btn?.click();
});
log("clicked reject");
await new Promise((r) => setTimeout(r, 2500));

// final: the record shows everything
await page.goto(`${BASE}/governance?tab=traces`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 5000));

await rec.stop();
log("stopped recording");
writeFileSync(resolve(OUT, "capture-notes.json"), JSON.stringify({ tookAt: Date.now(), approval1: true }, null, 2));
await browser.close();
console.log("DONE:", take);
