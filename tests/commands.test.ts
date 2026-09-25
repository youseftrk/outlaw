import { describe, it, expect, beforeAll } from "vitest";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { parseCommand, handleOperatorMessage } from "@/server/messaging/commands";
import { request, accept, lease } from "@/server/authority/engine";

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
    const { replies } = await handleOperatorMessage("thr-saqr", "status");
    expect(replies.length).toBeGreaterThan(0);
    expect(replies[0].text).toMatch(/servers|threats/i);
  });

  it("help lists commands", async () => {
    const { replies } = await handleOperatorMessage("thr-saqr", "help");
    expect(replies[0].text).toContain("isolate");
  });

  it("isolate <host> runs through governance and replies once the owner has said yes", async () => {
    // stg-worker-01 belongs to the Research & Compute Authority — contain needs their permission first
    const asked = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-research", agentId: "agt-hisn", capability: "contain", scope: { serverIds: ["srv-stg-worker-01"] }, justification: "drill", durationSec: 3600 },
      "agt-hisn"
    );
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    expect(accept(asked.lease.id, "ent-research").ok).toBe(true);
    expect(lease(asked.lease.id)?.status).toBe("active");

    const { replies } = await handleOperatorMessage("thr-saqr", "isolate stg-worker-01");
    expect(replies[0].text).toMatch(/isolat/i);
    expect(store.server("srv-stg-worker-01")?.status).toBe("isolated");
    // produced a trace with operator input
    const trace = store.s.traces.at(-1)!;
    expect(JSON.stringify(trace.spans[0]?.input)).toContain("operator");
  });

  it("approve/reject unknown id replies gracefully", async () => {
    const { replies } = await handleOperatorMessage("thr-saqr", "approve A-9999");
    expect(replies[0].text).toMatch(/no approval|already/i);
  });

  it("unknown text falls back to help hint", async () => {
    const { replies } = await handleOperatorMessage("thr-saqr", "xyzzy blorp");
    expect(replies[0].text).toMatch(/help|didn't catch/i);
  });

  it("who's on <host> names the protectors", async () => {
    const { replies } = await handleOperatorMessage("thr-saqr", "who's on dataset-worker-01");
    expect(replies[0].text).toContain("dataset-worker-01");
  });

  it("pause/resume toggles agent status", async () => {
    await handleOperatorMessage("thr-saqr", "pause rahhal");
    expect(store.agent("agt-rahhal")?.status).toBe("paused");
    await handleOperatorMessage("thr-saqr", "resume rahhal");
    expect(store.agent("agt-rahhal")?.status).toBe("idle");
  });
});
