import { test, expect } from "@playwright/test";
import { approvalStatus, createApproval, restoreSundance } from "./helpers";

test.describe("governance approvals", () => {
  test.afterEach(async ({ request }) => {
    await restoreSundance(request);
  });

  test("director-created approval shows in the sheet and resolves on Approve", async ({ page, request }) => {
    const approval = await createApproval(request);
    expect(approval.toolName).toBe("block_egress");

    await page.goto("/governance");
    await page.getByRole("button", { name: /approvals? waiting/ }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Needs you" })).toBeVisible();

    const card = sheet.locator("li").filter({ hasText: approval.id });
    await expect(card).toBeVisible();
    await expect(card.getByText("Sundance", { exact: true })).toBeVisible();
    await expect(card.getByText("block_egress").first()).toBeVisible();
    await expect(card.getByText("Risk score")).toBeVisible();
    await expect(card.getByTestId("approval-expiry")).toHaveText(/\d+m \d+s|\d+s/);
    await expect(card.getByText(/Autonomy cap: act-with-approval — risk medium requires approval/)).toBeVisible();

    const decided = page.waitForResponse((r) => r.url().endsWith(`/api/governance/approvals/${approval.id}`) && r.request().method() === "POST" && r.ok());
    await card.getByRole("button", { name: "Approve" }).click();
    await decided;

    await expect(page.getByText(new RegExp(`Approved ${approval.id}`))).toBeVisible();
    await expect(card).toHaveCount(0);

    expect(await approvalStatus(request, approval.id)).toBe("approved");
  });
});
