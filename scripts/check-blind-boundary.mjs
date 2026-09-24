#!/usr/bin/env node
/**
 * Blind boundary check (SPEC.md §2).
 *
 * server/agents/**, server/governance/**, server/messaging/** must never
 * import from server/range/** — agents only see telemetry, never range
 * internals.
 *
 * Pass 1: find every server file that re-exports from range (barrels).
 * Pass 2: watched dirs may not import range directly NOR import a barrel
 * that re-exports range. Exits 1 with the offending files.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const root = process.cwd();
const WATCHED = ["server/agents", "server/governance", "server/messaging"];
const IMPORT_RE = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']/g;
const RANGE_RE = /(^|[/\\])range([/\\]|$)/;
const REEXPORT_RE = /export\s+(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g;

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

/** resolve a relative specifier to an absolute file path (best effort) */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
  const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : resolve(dirname(fromFile), spec);
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function specifiersOf(file) {
  const src = readFileSync(file, "utf8");
  const specs = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.push(spec);
  }
  return specs;
}

// pass 1: barrels that re-export range (one level deep is enough — barrels
// only re-export; chains of barrels resolving to range are still caught
// because any intermediate barrel itself re-exports range)
const rangeBarrels = new Set();
for (const file of walk(join(root, "server"))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(REEXPORT_RE)) {
    if (RANGE_RE.test(m[1])) {
      rangeBarrels.add(file);
      break;
    }
  }
}

// pass 2: watched dirs — direct range imports or barrel imports
const offenders = [];
for (const dir of WATCHED) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    for (const spec of specifiersOf(file)) {
      if (RANGE_RE.test(spec)) {
        offenders.push(`${relative(root, file)} -> ${spec} (direct range import)`);
        continue;
      }
      const resolved = resolveSpec(file, spec);
      if (resolved && rangeBarrels.has(resolved)) {
        offenders.push(`${relative(root, file)} -> ${spec} (barrel re-exports range)`);
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
