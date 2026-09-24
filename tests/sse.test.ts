import { describe, it, expect, beforeAll } from "vitest";
import { getRuntime } from "@/server/runtime";
import { bus } from "@/server/bus";
import { emitSignal } from "@/server/telemetry";
import { store } from "@/server/store";
import { GET, formatEvent } from "@/app/api/events/route";

beforeAll(() => getRuntime());

describe("SSE /api/events", () => {
  it("formats event:/id:/data: lines", async () => {
    const sig = emitSignal("conformance.drift", { serverId: "srv-api-01", severity: "low" });
    const ev = store.s.events.at(-1)!;
    const out = formatEvent(ev);
    expect(out).toContain(`event: telemetry\n`);
    expect(out).toContain(`id: ${ev.id}\n`);
    expect(out).toContain(`data: `);
    expect(out.endsWith("\n\n")).toBe(true);
    void sig;
  });

  it("replays events after ?since", () => {
    const before = store.s.events.at(-1)!.id;
    emitSignal("conformance.drift", { serverId: "srv-web-01" });
    emitSignal("conformance.drift", { serverId: "srv-web-02" });
    const replayed = bus.replay(before);
    expect(replayed.length).toBe(2);
    expect(replayed[0].type).toBe("telemetry");
  });

  it("GET returns an event-stream that emits telemetry + heartbeat-capable stream", async () => {
    const req = new Request("http://localhost/api/events");
    const res = await GET(req);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    emitSignal("net.beacon-periodic", { serverId: "srv-api-02", severity: "high", attributes: { domain: "x.example" } });
    // read until we've seen the connect comment + a telemetry event
    let buf = "";
    const deadline = Date.now() + 5000;
    while (!buf.includes("event: telemetry") && Date.now() < deadline) {
      emitSignal("conformance.drift", { serverId: "srv-api-03" });
      const { value } = await Promise.race([
        reader.read(),
        new Promise<{ value?: Uint8Array }>((res) => setTimeout(() => res({}), 500)),
      ]);
      if (value) buf += dec.decode(value, { stream: true });
    }
    expect(buf).toContain(": connected");
    expect(buf).toContain("event: telemetry");
    await reader.cancel();
  });
});
