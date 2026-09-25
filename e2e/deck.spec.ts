import { test, expect } from "@playwright/test";

test.describe("deck", () => {
  test("deep link opens slide 3 and ArrowRight advances", async ({ page }) => {
    await page.goto("/deck?slide=3");

    const counter = page.locator(".deck-chrome").getByText(/\d{2} \/ \d{2}/);
    await expect(counter).toHaveText(/03 \/ \d{2}/);
    // slide 3 = "The problem" — only the live copy is visible (print copy is display:none)
    await expect(page.locator(".deck > section").getByText("Attackers now move at machine speed.", { exact: false })).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(counter).toHaveText(/04 \/ \d{2}/);
    await expect(page).toHaveURL(/slide=4/);
    await expect(page.locator(".deck > section").getByText("A gang of AI agents")).toBeVisible();
  });
});
