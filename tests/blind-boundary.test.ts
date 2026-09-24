import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("blind boundary", () => {
  it("current tree is clean", () => {
    const out = execFileSync("node", ["scripts/check-blind-boundary.mjs"], { cwd: ROOT, encoding: "utf8" });
    expect(out).toContain("clean");
  });

  it("flags a range import under server/agents (fixture)", () => {
    const dir = join(ROOT, "server", "agents", "__fixture__");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "leak.ts"), `import { tickRange } from "../../range/engine";\nexport const x = tickRange;\n`);
    try {
      let failed = false;
      try {
        execFileSync("node", ["scripts/check-blind-boundary.mjs"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags a barrel that re-exports range (fixture)", () => {
    const barrelDir = join(ROOT, "server", "__fixturebarrel__");
    const leakDir = join(ROOT, "server", "agents", "__fixture2__");
    mkdirSync(barrelDir, { recursive: true });
    mkdirSync(leakDir, { recursive: true });
    writeFileSync(join(barrelDir, "index.ts"), `export * from "../range/engine";\n`);
    writeFileSync(join(leakDir, "leak2.ts"), `import { tickRange } from "../../__fixturebarrel__";\nexport const y = tickRange;\n`);
    try {
      let failed = false;
      try {
        execFileSync("node", ["scripts/check-blind-boundary.mjs"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    } finally {
      rmSync(barrelDir, { recursive: true, force: true });
      rmSync(leakDir, { recursive: true, force: true });
    }
  });
});
