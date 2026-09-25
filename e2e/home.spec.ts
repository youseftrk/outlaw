import { test, expect } from "@playwright/test";

const AGENTS = ["Saqr", "Hisn", "Athar", "Miftah", "Rahhal", "Bawwab"];

test.describe("home", () => {
  test("renders sidebar wordmark, roster of six and a live feed", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("img", { name: "Qalaa" })).toBeVisible();

    const roster = page.locator("ul").filter({ has: page.getByRole("link", { name: /Saqr/ }) }).first();
    await expect(roster.getByRole("link")).toHaveCount(6);
    for (const name of AGENTS) await expect(roster.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  });

  test("live garrison feed receives a new SSE event within 15 s", async ({ page }) => {
    await page.goto("/drill/replay");
    const feed = page.getByText("Garrison response · live").locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(feed).toBeVisible();

    const snapshot = async () => (await feed.innerText()).trim();
    const before = await snapshot();
    await expect.poll(snapshot, { timeout: 15_000, message: "feed should receive a new event" }).not.toBe(before);
  });
});
