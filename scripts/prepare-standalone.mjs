#!/usr/bin/env node
/**
 * Prepare the Next standalone output for the Electron bundle.
 *
 * `next build` with output:"standalone" emits .next/standalone containing a
 * minimal server.js, but static assets must be copied in manually:
 *   .next/static  -> .next/standalone/.next/static
 *   public/       -> .next/standalone/public
 */
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
  console.error("prepare-standalone: .next/standalone/server.js not found — run `next build` first.");
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
}
console.log("prepare-standalone: static assets copied into .next/standalone.");
