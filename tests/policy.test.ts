import { describe, it, expect, beforeAll } from "vitest";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { evaluate } from "@/server/governance/policy";
import type { Agent } from "@/lib/types";

beforeAll(() => getRuntime());

const agent = (autonomy: Agent["autonomy"] = "autonomous"): Agent =>
  store.s.agents.find((a) => a.id === "agt-hisn")!
    ? { ...store.s.agents.find((a) => a.id === "agt-hisn")!, autonomy }
    : (() => { throw new Error("no hisn"); })();

describe("policy engine", () => {
  it("deny wins over allow (prod→sandbox migration)", () => {
    const src = store.server("srv-api-01")!;
    const res = evaluate(agent(), "migrate_workload", { server: src, targetEnv: "sandbox" });
    expect(res.effect).toBe("deny");
    expect(res.evaluations.some((e) => e.policyId === "pol-02" && e.matched)).toBe(true);
  });

  it("rebuild_node on database requires approval (pol-01)", () => {
    const db = store.server("srv-hub-db-01")!;
    const res = evaluate(agent(), "rebuild_node", { server: db });
    expect(res.effect).toBe("require-approval");
    expect(res.evaluations.find((e) => e.policyId === "pol-01")?.matched).toBe(true);
  });

  it("rebuild_node on prod non-database requires approval (pol-07)", () => {
    const node = store.server("srv-prod-node-01")!;
    const res = evaluate(agent(), "rebuild_node", { server: node });
    expect(res.effect).toBe("require-approval");
  });

  it("credential hygiene allowed autonomously (pol-04)", () => {
    const res = evaluate(agent(), "revoke_token", {});
    expect(res.effect).toBe("allow");
  });

  it("containment allowed at medium+ severity (pol-03)", () => {
    const res = evaluate(agent(), "isolate_host", { server: store.server("srv-dataset-worker-01")!, severity: "high" });
    expect(res.effect).toBe("allow");
  });

  it("containment below min severity falls through to default allow", () => {
    const res = evaluate(agent(), "isolate_host", { server: store.server("srv-api-01")!, severity: "low" });
    // pol-03 doesn't match (severity too low) but pol-10 default allow does
    expect(res.effect).toBe("allow");
    expect(res.evaluations.find((e) => e.policyId === "pol-03")?.matched).toBe(false);
  });

  it("autonomy caps: observe denies mutating tools", () => {
    const res = evaluate(agent("observe"), "isolate_host", {});
    expect(res.effect).toBe("deny");
    expect(res.evaluations[0].policyId).toBe("cap");
  });

  it("autonomy caps: recommend → require-approval on mutating", () => {
    const res = evaluate(agent("recommend"), "revoke_token", {});
    expect(res.effect).toBe("require-approval");
  });

  it("autonomy caps: act-with-approval gates medium+ risk only", () => {
    expect(evaluate(agent("act-with-approval"), "revoke_token", {}).effect).toBe("require-approval");
    expect(evaluate(agent("act-with-approval"), "query_telemetry", {}).effect).toBe("allow");
  });

  it("read tools always allowed (pol-08)", () => {
    const res = evaluate(agent(), "run_conformance", { server: store.server("srv-web-01")! });
    expect(res.effect).toBe("allow");
  });
});
