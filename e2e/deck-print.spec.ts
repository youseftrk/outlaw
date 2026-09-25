import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

test.describe("deck print", () => {
  test("page.pdf renders one page per slide", async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "page.pdf is Chromium-only");

    await page.goto("/deck");
    await page.locator(".deck-print > section").first().waitFor({ state: "attached" });
    const slideCount = await page.locator(".deck-print > section").count();
    expect(slideCount).toBeGreaterThan(0);
    await expect(page.locator(".deck-chrome").getByText(new RegExp(`/ ${String(slideCount).padStart(2, "0")}$`))).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: false });

    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(slideCount);
    for (const p of doc.getPages()) {
      const { width, height } = p.getSize();
      expect(Math.round(width)).toBe(1440); // 1920 CSS px @ 96dpi → 1440 pt
      expect(Math.round(height)).toBe(810);
    }

    const out = join(testInfo.outputDir, "deck.pdf");
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(out, pdf);
    await testInfo.attach("deck.pdf", { path: out, contentType: "application/pdf" });
  });
});
