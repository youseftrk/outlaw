#!/usr/bin/env node
/**
 * Blind boundary check (SPEC.md §2).
 *
 * server/agents/**, server/governance/**, server/messaging/** must never
 * import from server/range/** — agents only see telemetry, never range
 * internals. Scans those directories for import/export specifiers whose
 * path contains "/range" or "range/". Exits 1 with the offending files.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const WATCHED = ["server/agents", "server/governance", "server/messaging"];
const IMPORT_RE = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']/g;
const RANGE_RE = /(^|[/\\])range([/\\]|$)/;

/** @param {string} dir @param {string[]} [acc] */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

if (!existsSync(join(root, "server"))) {
  console.log("check-blind-boundary: no server/ directory yet — skipped.");
  process.exit(0);
}

const offenders = [];
for (const dir of WATCHED) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec && RANGE_RE.test(spec)) {
        offenders.push(`${relative(root, file)} -> ${spec}`);
      }
    }
  }
}

if (offenders.length) {
  console.error("check-blind-boundary: range imports leaked into agent-visible modules:");
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log("check-blind-boundary: clean.");
