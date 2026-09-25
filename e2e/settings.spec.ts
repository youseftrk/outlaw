import { test, expect } from "@playwright/test";

const speedLabel = (page: import("@playwright/test").Page) => page.getByText(/^Speed ·/).locator("span.mono-data");

test.describe("settings", () => {
  test.afterAll(async ({ request }) => {
    await request.patch("/api/settings", { data: { sim: { speed: 1 } } });
  });

  test("simulation speed slider saves with a toast and persists across reload", async ({ page, request }) => {
    await request.patch("/api/settings", { data: { sim: { speed: 1 } } });

    await page.goto("/settings");
    await expect(speedLabel(page)).toHaveText("1×");

    const slider = page.getByRole("slider");
    await slider.focus();
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");
    await expect(speedLabel(page)).toHaveText("3×");

    const saved = page.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() !== "GET" && r.ok());
    await page.getByRole("heading", { name: "Simulation" }).locator("xpath=ancestor::*[@data-slot='card'][1]").getByRole("button", { name: "Save" }).click();
    await saved;
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.reload();
    await expect(speedLabel(page)).toHaveText("3×");
    expect(((await (await request.get("/api/settings")).json()) as { sim: { speed: number } }).sim.speed).toBe(3);
  });
});
