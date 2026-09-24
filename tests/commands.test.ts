import { describe, it, expect, beforeAll } from "vitest";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { parseCommand, handleOperatorMessage } from "@/server/messaging/commands";

beforeAll(() => getRuntime());

describe("command parser", () => {
  it("parses verb + args case-insensitively", () => {
    expect(parseCommand("STATUS").verb).toBe("status");
    expect(parseCommand("approve A-7").args).toEqual(["A-7"]);
    expect(parseCommand("  isolate   dataset-worker-01 ").args[0]).toBe("dataset-worker-01");
  });
});

describe("command dispatch", () => {
  it("status returns a fleet summary", async () => {
    const { replies } = await handleOperatorMessage("thr-cassidy", "status");
    expect(replies.length).toBeGreaterThan(0);
    expect(replies[0].text).toMatch(/servers|threats/i);
  });

  it("help lists commands", async () => {
    const { replies } = await handleOperatorMessage("thr-cassidy", "help");
    expect(replies[0].text).toContain("isolate");
  });

  it("isolate <host> runs through governance and replies", async () => {
    const { replies } = await handleOperatorMessage("thr-cassidy", "isolate stg-worker-01");
    expect(replies[0].text).toMatch(/isolat/i);
    expect(store.server("srv-stg-worker-01")?.status).toBe("isolated");
    // produced a trace with operator input
    const trace = store.s.traces.at(-1)!;
    expect(JSON.stringify(trace.spans[0]?.input)).toContain("operator");
  });

  it("approve/reject unknown id replies gracefully", async () => {
    const { replies } = await handleOperatorMessage("thr-cassidy", "approve A-9999");
    expect(replies[0].text).toMatch(/no approval|already/i);
  });

  it("unknown text falls back to help hint", async () => {
    const { replies } = await handleOperatorMessage("thr-cassidy", "xyzzy blorp");
    expect(replies[0].text).toMatch(/help|didn't catch/i);
  });

  it("who's on <host> names the protectors", async () => {
    const { replies } = await handleOperatorMessage("thr-cassidy", "who's on dataset-worker-01");
    expect(replies[0].text).toContain("dataset-worker-01");
  });

  it("pause/resume toggles agent status", async () => {
    await handleOperatorMessage("thr-cassidy", "pause ringo");
    expect(store.agent("agt-ringo")?.status).toBe("paused");
    await handleOperatorMessage("thr-cassidy", "resume ringo");
    expect(store.agent("agt-ringo")?.status).toBe("idle");
  });
});
