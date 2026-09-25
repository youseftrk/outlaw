// Regenerate explainer.srt + explainer.vtt from the caption clips in index.html.
// Single source of truth for caption timing = the .cap elements themselves.
// Usage: node scripts/make-srt.mjs
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const re = /<div id="cap-\d+" class="clip cap" data-start="([\d.]+)"\s+data-duration="([\d.]+)">([^<]+)<\/div>/g;
const caps = [];
let m;
while ((m = re.exec(html))) caps.push({ start: +m[1], end: +m[1] + +m[2], text: m[3].trim() });
if (!caps.length) throw new Error("no captions found in index.html");

const t = (s, sep = ",") => {
  const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}${sep}${String(ms).padStart(3, "0")}`;
};

const srt = caps.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join("\n");
const vtt = `WEBVTT\n\n${caps.map((c) => `${t(c.start, ".")} --> ${t(c.end, ".")}\n${c.text}\n`).join("\n")}`;
writeFileSync(new URL("../explainer.srt", import.meta.url), srt);
writeFileSync(new URL("../explainer.vtt", import.meta.url), vtt);
console.log(`wrote ${caps.length} captions → explainer.srt + explainer.vtt`);
