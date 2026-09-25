import { test, expect } from "@playwright/test";
import { patchAgent } from "./helpers";

const patchOf = (id: string) => (r: import("@playwright/test").Response) =>
  r.url().includes(`/api/agents/${id}`) && r.request().method() === "PATCH" && r.ok();

test.describe("agents", () => {
  test.afterEach(async ({ request }) => {
    await patchAgent(request, "agt-cassidy", { status: "idle" });
  });

  test("Cassidy detail shows traces tab and the pause switch flips state via PATCH", async ({ page, request }) => {
    await patchAgent(request, "agt-cassidy", { status: "idle" });

    await page.goto("/agents");
    await page.getByRole("link", { name: /Cassidy/ }).first().click();
    await expect(page).toHaveURL(/\/agents\/agt-cassidy$/);
    await expect(page.getByRole("heading", { name: /Cassidy/ })).toBeVisible();

    // Cassidy is the orchestrator: she coordinates but never runs tools herself,
    // so her traces tab renders with the count her API reports (usually 0).
    const { traces } = (await (await request.get("/api/agents/agt-cassidy")).json()) as { traces: unknown[] };
    const tracesTab = page.getByRole("tab", { name: `Traces (${traces.length})` });
    await tracesTab.click();
    if (traces.length === 0) await expect(page.getByText("No traces yet.")).toBeVisible();
    else await expect(page.getByRole("tabpanel").getByRole("button").first()).toBeVisible();

    const pause = page.getByRole("switch");
    await expect(pause).toBeVisible();
    await expect(pause).toHaveAttribute("aria-checked", "false");

    const patched = page.waitForResponse(patchOf("agt-cassidy"));
    await pause.click();
    expect((await (await patched).json()).agent.status).toBe("paused");

    await expect(pause).toHaveAttribute("aria-checked", "true");
    // status badge next to the "Status" eyebrow flips to Paused
    await expect(page.getByText("Status", { exact: true }).locator("xpath=following-sibling::*[1]")).toHaveText("Paused");
    await expect(page.getByText(/Cassidy paused/)).toBeVisible();

    const unpatched = page.waitForResponse(patchOf("agt-cassidy"));
    await pause.click();
    expect((await (await unpatched).json()).agent.status).toBe("idle");
    await expect(pause).toHaveAttribute("aria-checked", "false");
  });

  test("a tool-running agent lists its traces", async ({ page }) => {
    await page.goto("/agents/agt-sundance");
    const tracesTab = page.getByRole("tab", { name: /^Traces \(\d+\)$/ });
    await expect(tracesTab).not.toHaveText(/\(0\)/);
    await tracesTab.click();
    await expect(page.getByRole("tabpanel").getByRole("button").first()).toBeVisible();
  });

  test("detail log is pre-filled from persisted history", async ({ page, request }) => {
    const { events } = (await (await request.get("/api/agents/agt-cassidy")).json()) as { events: { id: string; summary?: string }[] };
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(200);

    await page.goto("/agents/agt-cassidy");
    await expect(page.getByRole("tab", { name: "Live log" })).toBeVisible();
    // persisted lines land before any SSE event arrives: HH:mm:ss + summary
    const lines = page.getByRole("tabpanel").locator("span.text-text-3", { hasText: /^\d{2}:\d{2}:\d{2}$/ });
    await expect(lines.first()).toBeVisible();
    const lastSummary = events.at(-1)?.summary;
    if (lastSummary) await expect(page.getByRole("tabpanel").getByText(lastSummary.trim().slice(0, 40), { exact: false }).first()).toBeVisible();
  });
});
