import { describe, it, expect, beforeAll } from "vitest";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { conformanceScore, catalogForRole, evaluateChecks } from "@/server/fleet/conformance";
import type { ConformanceCheck } from "@/lib/types";

beforeAll(() => getRuntime());

const check = (status: ConformanceCheck["status"]): ConformanceCheck => ({
  id: "x", name: "x", category: "patching", status, detail: "", checkedAt: "", autoRemediable: false,
});

describe("conformance scoring", () => {
  it("fail = -12, warn = -4, clamped ≥ 0", () => {
    expect(conformanceScore([])).toBe(100);
    expect(conformanceScore([check("fail")])).toBe(88);
    expect(conformanceScore([check("warn")])).toBe(96);
    expect(conformanceScore([check("fail"), check("warn"), check("pass")])).toBe(84);
    expect(conformanceScore(Array(10).fill(check("fail")))).toBe(0);
  });

  it("≥6 checks per role", () => {
    for (const role of ["api", "worker", "registry", "k8s-node", "database", "bastion", "inference", "storage"] as const) {
      expect(catalogForRole(role).length).toBeGreaterThanOrEqual(6);
    }
  });

  it("seeded workers fail the known-CVE check", () => {
    const wk = store.server("srv-dataset-worker-01")!;
    const checks = evaluateChecks(wk, store.now());
    expect(checks.find((c) => c.id.endsWith("known-cves"))?.status).toBe("fail");
    expect(wk.conformanceScore).toBeLessThan(100);
  });

  it("registry fails plugin-install check at seed", () => {
    const reg = store.server("srv-pkg-cache-01")!;
    expect(reg.checks.find((c) => c.id.endsWith("plugin-install-off"))?.status).toBe("fail");
  });
});
