// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "./setup";

import type { Approval, Server, Trace } from "@/lib/types";

vi.mock("bot-avatars", () => ({ BotAvatar: () => <svg data-testid="bot" /> }));

const traceState: { data: Trace | undefined } = { data: undefined };
vi.mock("@/lib/hooks/use-data", () => ({
  useTrace: () => ({ data: traceState.data }),
  useApprovals: () => ({ data: [], mutate: vi.fn() }),
  useBootstrap: () => ({ data: undefined }),
}));
vi.mock("@/lib/hooks/use-live", () => ({
  useLive: () => ({ lastEventAt: undefined, events: [] }),
}));

import { ApprovalItem, expiresIn, targetLabel, APPROVAL_TTL_SEC } from "@/components/shell/approvals-sheet";

const approval: Approval = {
  id: "apr-1001",
  traceId: "trc-77",
  agentId: "agt-athar",
  toolName: "rebuild_node",
  summary: "Rebuild prod-api-01 from golden image",
  risk: "destructive",
  targets: ["srv-01"],
  status: "pending",
  requestedAt: "2026-03-01T10:00:00.000Z",
};

const servers = [{ id: "srv-01", hostname: "prod-api-01" }] as unknown as Server[];

const trace = {
  id: "trc-77",
  riskScore: 82,
  spans: [
    {
      id: "spn-1",
      kind: "policy",
      label: "policy",
      startedAt: approval.requestedAt,
      status: "pending",
      toolName: "rebuild_node",
      policyEvaluations: [
        { policyId: "pol-a", policyName: "Allow reads", effect: "allow", matched: false, reason: "n/a" },
        { policyId: "pol-b", policyName: "Prod rebuilds need a human", effect: "require-approval", matched: true, reason: "destructive tool on prod" },
      ],
    },
  ],
} as unknown as Trace;

beforeEach(() => {
  traceState.data = undefined;
});

describe("approvals helpers", () => {
  it("counts down from the TTL and never goes negative", () => {
    expect(expiresIn(approval, approval.requestedAt)).toBe(APPROVAL_TTL_SEC);
    expect(expiresIn(approval, "2026-03-01T10:05:00.000Z")).toBe(300);
    expect(expiresIn(approval, "2026-03-01T11:00:00.000Z")).toBe(0);
  });

  it("resolves target ids to hostnames when known", () => {
    expect(targetLabel(approval, servers)).toBe("prod-api-01");
    expect(targetLabel(approval, [])).toBe("srv-01");
    expect(targetLabel({ ...approval, targets: [] }, servers)).toBe("—");
  });
});

describe("ApprovalItem", () => {
  it("shows agent, tool, target, risk score, policy reason and expiry", () => {
    traceState.data = trace;
    render(
      <ul>
        <ApprovalItem approval={approval} agentName="Athar" servers={servers} nowIso="2026-03-01T10:04:00.000Z" deciding={null} onDecide={() => {}} />
      </ul>,
    );
    expect(screen.getByText("Athar")).toBeTruthy();
    expect(screen.getByText("destructive")).toBeTruthy();
    expect(screen.getByText("rebuild_node")).toBeTruthy();
    expect(screen.getByText("prod-api-01")).toBeTruthy();
    expect(screen.getByText("82/100")).toBeTruthy();
    expect(screen.getByTestId("approval-expiry").textContent).toBe("6m 0s");
    expect(screen.getByText(/Prod rebuilds need a human — destructive tool on prod/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open trace" }).getAttribute("href")).toBe("/record?tab=traces&trace=trc-77");
  });

  it("falls back gracefully while the trace is still loading", () => {
    render(
      <ul>
        <ApprovalItem approval={approval} agentName="Athar" servers={[]} nowIso={approval.requestedAt} deciding={null} onDecide={() => {}} />
      </ul>,
    );
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/loading policy/)).toBeTruthy();
    expect(screen.getByTestId("approval-expiry").textContent).toBe("10m 0s");
  });

  it("fires decisions and disables both buttons while one is in flight", () => {
    traceState.data = trace;
    const onDecide = vi.fn();
    const { rerender } = render(
      <ul>
        <ApprovalItem approval={approval} agentName="Athar" servers={servers} nowIso={approval.requestedAt} deciding={null} onDecide={onDecide} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(onDecide).toHaveBeenCalledWith("approve");
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(onDecide).toHaveBeenCalledWith("reject");

    rerender(
      <ul>
        <ApprovalItem approval={approval} agentName="Athar" servers={servers} nowIso={approval.requestedAt} deciding="approve" onDecide={onDecide} />
      </ul>,
    );
    const approving = screen.getByRole("button", { name: /Approving…/ }) as HTMLButtonElement;
    const reject = screen.getByRole("button", { name: /Reject/ }) as HTMLButtonElement;
    expect(approving.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
  });
});
