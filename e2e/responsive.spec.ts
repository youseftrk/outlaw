import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const PAGES = ["/", "/fleet", "/threats", "/messages", "/governance", "/governance?tab=policies"];

test.describe("responsive @ 390×844", () => {
  for (const path of PAGES) {
    test(`${path} has no horizontal overflow and the sidebar is collapsed`, async ({ page }) => {
      await page.goto(path);
      // let SWR data land (tables/cards render after fetch)
      await expect(page.locator("table, [data-slot='card']").first()).toBeVisible();

      // desktop sidebar is not rendered below md; the mobile sheet stays closed
      await expect(page.locator("[data-slot='sidebar']")).toHaveCount(0);
      await expect(page.getByRole("img", { name: "Qalaa" })).toHaveCount(0);

      await expectNoHorizontalOverflow(page);

      // still no overflow after scrolling to the bottom (lazy-mounted content)
      await page.mouse.wheel(0, 4000);
      await expectNoHorizontalOverflow(page);
    });
  }
});
