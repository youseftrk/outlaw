import { test, expect } from "@playwright/test";
import { director } from "./helpers";

test.describe("threats", () => {
  test("first threat opens with a kill-chain timeline, IOCs, and can be escalated", async ({ page, request }) => {
    // make sure at least one threat is still open so the Escalate action is offered
    const open = await (await request.get("/api/threats?open=true&limit=1")).json();
    if (open.threats.length === 0) await director(request, "brute-force");

    await page.goto("/threats");
    const firstRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: /.+/ }) }).first();
    const link = firstRow.getByRole("link").first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/threats\/T-\d+$/);

    await expect(page.getByText("Kill chain")).toBeVisible();
    await expect(page.getByText(/stages stopped/)).toBeVisible();

    const iocsTab = page.getByRole("tab", { name: /^IOCs \(\d+\)$/ });
    await iocsTab.click();
    await expect(page.getByRole("columnheader", { name: "Value" })).toBeVisible();
    await expect(page.getByRole("tabpanel").getByRole("row").nth(1)).toBeVisible();

    // escalate an open threat (the first row may already be neutralized — pick an open one if so)
    const escalate = page.getByRole("button", { name: "Escalate" });
    if (!(await escalate.isVisible())) {
      const { threats } = await (await request.get("/api/threats?open=true&limit=1")).json();
      expect(threats.length).toBeGreaterThan(0);
      await page.goto(`/threats/${threats[0].id}`);
    }
    await expect(escalate).toBeVisible();

    const acted = page.waitForResponse((r) => /\/api\/threats\/T-\d+\/action$/.test(r.url()) && r.ok());
    await escalate.click();
    const body = await (await acted).json();
    expect(body.threat.status).toBe("escalated");
    await expect(page.getByText("Escalated to the operator")).toBeVisible();
    await expect(page.getByText("Escalated", { exact: true })).toBeVisible();
  });
});
