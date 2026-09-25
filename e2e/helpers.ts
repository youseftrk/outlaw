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

export async function patchAgent(request: APIRequestContext, id: string, body: Partial<Pick<ApiAgent, "autonomy" | "status">> & { paused?: boolean }) {
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
 * at `act-with-approval` so her medium-risk `block_egress` needs a human, then
 * inject a director scenario whose plan starts with that tool. The brain dedupes
 * a category+server pair for 5 simulated minutes, so fall through the scenarios
 * until one yields a fresh approval.
 */
export async function createApproval(request: APIRequestContext, scenarios = ["c2-beacon", "exfil", "brute-force"]) {
  const before = new Set((await pendingApprovals(request)).map((a) => a.id));
  await patchAgent(request, "agt-sundance", { autonomy: "act-with-approval" });
  const fresh = async () => (await pendingApprovals(request)).find((a) => !before.has(a.id) && a.agentId === "agt-sundance");

  for (const scenario of scenarios) {
    await director(request, scenario);
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const a = await fresh();
      if (a) return a;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`director scenarios [${scenarios.join(", ")}] did not yield a pending approval for Sundance`);
}

export async function approvalStatus(request: APIRequestContext, id: string) {
  const res = await request.get("/api/governance/approvals");
  expect(res.ok()).toBeTruthy();
  const { approvals } = (await res.json()) as { approvals: ApiApproval[] };
  return approvals.find((a) => a.id === id)?.status;
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
  // dense tables must fit their container too — an inner overflow-x-auto scroll
  // keeps the document width honest while still clipping columns off-screen
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Math.max(
            0,
            ...Array.from(document.querySelectorAll<HTMLElement>("[data-slot='table-container']")).map(
              (el) => el.scrollWidth - el.clientWidth,
            ),
          ),
        ),
      { message: "no table should scroll horizontally inside its container" },
    )
    .toBeLessThanOrEqual(0);
}
