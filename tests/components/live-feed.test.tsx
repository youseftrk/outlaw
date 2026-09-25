// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "./setup";

import type { QalaaEvent } from "@/lib/types";

vi.mock("bot-avatars", () => ({ BotAvatar: () => <svg data-testid="bot" /> }));

const live: { events: QalaaEvent[] } = { events: [] };
vi.mock("@/lib/hooks/use-live", () => ({
  useLive: () => ({ events: live.events }),
}));

import { LiveFeed } from "@/components/compositions/live-feed";

function ev(partial: Partial<QalaaEvent> & Pick<QalaaEvent, "id" | "type">): QalaaEvent {
  return { at: "2026-03-01T10:00:00.000Z", ...partial } as QalaaEvent;
}

describe("LiveFeed", () => {
  it("renders the quiet empty state when nothing is on the wire", () => {
    live.events = [];
    render(<LiveFeed />);
    expect(screen.getByText("Quiet on the wire.")).toBeTruthy();
  });

  it("shows only feed-worthy event types, newest first, capped at the limit", () => {
    live.events = [
      ev({ id: "e1", type: "threat.detected", summary: "Brute force on prod-db-01", severity: "high" }),
      ev({ id: "e2", type: "agent.status", summary: "hidden status event", agentId: "agt-athar" }),
      ev({ id: "e3", type: "agent.action", summary: "Athar isolated prod-db-01", agentId: "agt-athar" }),
      ev({ id: "e4", type: "message.sent", payload: { text: "Saqr: status is green" } }),
    ];
    render(<LiveFeed limit={2} />);
    const rows = screen.getAllByText(/prod-db-01|status is green/).map((el) => el.textContent);
    expect(rows).toEqual(["Saqr: status is green", "Athar isolated prod-db-01"]);
    expect(screen.queryByText("hidden status event")).toBeNull();
    expect(screen.queryByText("Brute force on prod-db-01")).toBeNull();
    expect(screen.getAllByTestId("bot")).toHaveLength(1);
  });

  it("links events with an href to their destination", () => {
    live.events = [ev({ id: "e9", type: "approval.requested", summary: "Athar wants to rebuild prod-api-01", href: "/governance?tab=approvals" })];
    render(<LiveFeed />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/governance?tab=approvals");
  });
});
