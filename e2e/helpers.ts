import { expect, type APIRequestContext, type Page } from "@playwright/test";

export interface ApiApproval {
  id: string;
  agentId: string;
  toolName: string;
  status: "pending" | "approved" | "rejected" | "expired";
}

export interface ApiAgent {
  id: string;
  name: string;
  autonomy: "observe" | "recommend" | "act-with-approval" | "autonomous";
  status: string;
}

export async function getAgent(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/agents/${id}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).agent as ApiAgent;
}

export async function patchAgent(request: APIRequestContext, id: string, body: Partial<Pick<ApiAgent, "autonomy" | "status">>) {
  const res = await request.patch(`/api/agents/${id}`, { data: body });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).agent as ApiAgent;
}

export async function director(request: APIRequestContext, scenario: string) {
  const res = await request.post("/api/director", { data: { scenario } });
  expect(res.ok()).toBeTruthy();
}

export async function pendingApprovals(request: APIRequestContext) {
  const res = await request.get("/api/governance/approvals?status=pending");
  expect(res.ok()).toBeTruthy();
  return (await res.json()).approvals as ApiApproval[];
}

/**
 * Deterministic require-approval path (SPEC §policy): cap Sundance (containment)
 * at `act-with-approval` so its medium-risk `block_egress` needs a human, then
 * inject the director's c2-beacon so the brain plans that tool.
 */
export async function createApproval(request: APIRequestContext) {
  const before = new Set((await pendingApprovals(request)).map((a) => a.id));
  await patchAgent(request, "agt-sundance", { autonomy: "act-with-approval" });
  await director(request, "c2-beacon");
  let fresh: ApiApproval | undefined;
  await expect
    .poll(
      async () => {
        fresh = (await pendingApprovals(request)).find((a) => !before.has(a.id) && a.agentId === "agt-sundance");
        return fresh?.id;
      },
      { timeout: 30_000, message: "director c2-beacon should yield a pending approval for Sundance" },
    )
    .toBeTruthy();
  return fresh!;
}

export async function restoreSundance(request: APIRequestContext) {
  await patchAgent(request, "agt-sundance", { autonomy: "autonomous" });
}

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: "document should not scroll horizontally",
    })
    .toBeLessThanOrEqual(0);
}
