import { describe, it, expect, beforeAll } from "vitest";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { startRun } from "@/server/range/engine";

beforeAll(() => getRuntime());

describe("blind range — hf-2026", () => {
  it("baseline: agents paused → all 14 stages succeed", async () => {
    const rt = getRuntime();
    const run = startRun("hf-2026", "baseline", 8);
    expect("error" in run).toBe(false);
    if ("error" in run) return;
    await rt.fastForward(400); // 400 ticks > 360 s duration at 8×
    expect(run.status).toBe("completed");
    expect(run.score?.stagesSucceeded).toBe(14);
    expect(run.score?.stagesBlocked).toBe(0);
    expect(run.score?.grade).toBe("F"); // chain runs to completion in baseline
    // baseline still records detections
    expect(store.s.threats.some((t) => t.rangeRunId === run.id)).toBe(true);
  }, 60_000);

  it("protected: agents stop the chain — ≥5 blocked-or-skipped, grade ≥ C, ≥1 prevented", async () => {
    const rt = getRuntime();
    rt.reset(); // fresh world
    const run = startRun("hf-2026", "protected", 8);
    expect("error" in run).toBe(false);
    if ("error" in run) return;
    await rt.fastForward(400, { autoApprove: true });
    expect(run.status).toBe("completed");
    const blocked = run.stepResults.filter((r) => r.status === "blocked").length;
    const skipped = run.stepResults.filter((r) => r.status === "skipped").length;
    expect(blocked + skipped).toBeGreaterThanOrEqual(5);
    expect(["S", "A", "B", "C"].includes(run.score!.grade)).toBe(true);
    const prevented = store.s.threats.filter((t) => t.status === "prevented");
    expect(prevented.length).toBeGreaterThanOrEqual(1);
    // every blocked step has blockedBy attribution (skipped = never reached)
    const blockedNoBy = run.stepResults.filter((r) => r.status === "blocked" && !r.blockedBy?.agentId);
    expect(blockedNoBy.length).toBe(0);
  }, 60_000);
});
