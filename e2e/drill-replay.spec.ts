import { test, expect } from "@playwright/test";

test.describe("range", () => {
  // 6 simulated minutes at 8× ≈ 45 s wall-clock, plus build/boot slack
  test.setTimeout(180_000);

  test.afterEach(async ({ request }) => {
    const { activeRun } = await (await request.get("/api/range")).json();
    if (activeRun && activeRun.status !== "completed" && activeRun.status !== "aborted") {
      await request.post(`/api/range/${activeRun.id}/abort`);
    }
  });

  test("a protected replay runs to completion and shows a grade", async ({ page, request }) => {
    await page.goto("/drill/replay");
    const start = page.getByRole("button", { name: "Start the replay" });
    await expect(start).toBeEnabled();

    // fastest scenario clock (8×) via the existing speed slider
    const slider = page.getByRole("slider");
    await slider.focus();
    await slider.press("End");
    await expect(page.getByText(/Speed ·\s*8×/)).toBeVisible();

    const started = page.waitForResponse((r) => r.url().endsWith("/api/range/run") && r.request().method() === "POST" && r.ok());
    await start.click();
    const { run } = (await (await started).json()) as { run: { id: string; speed: number } };
    expect(run.speed).toBe(8);
    await expect(page.getByText("Replay started. The garrison has no idea.")).toBeVisible();

    // progress: status badge visible, scenario clock advancing (NumberFlow splits
    // digits across spans, so read the clock from the API and the ` · 8×` suffix from the UI)
    await expect(page.getByText("running", { exact: true }).first()).toBeVisible();
    await expect(page.locator("span.mono-data", { hasText: /^clock/ }).filter({ hasText: /8×/ })).toBeVisible();
    await expect
      .poll(async () => ((await (await request.get(`/api/range/${run.id}`)).json()) as { run: { clockMs: number } }).run.clockMs, {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    // results
    await expect
      .poll(async () => ((await (await request.get(`/api/range/${run.id}`)).json()) as { run: { status: string } }).run.status, {
        timeout: 150_000,
        intervals: [2_000],
      })
      .toBe("completed");
    await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Grade · protected/)).toBeVisible();
    await expect(page.getByText(/Grade · protected/).locator("xpath=following-sibling::p[1]")).toHaveText(/^[SABCDF]$/);
    await expect(page.getByText("vs. what really happened")).toBeVisible();
  });
});
