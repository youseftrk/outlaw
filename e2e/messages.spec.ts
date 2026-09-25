import { test, expect } from "@playwright/test";
import { approvalStatus, createApproval, restoreSundance } from "./helpers";

test.describe("messages", () => {
  test.afterEach(async ({ request }) => {
    await restoreSundance(request);
  });

  test("`status` gets a reply from Cassidy and `Approve <id>` resolves an approval", async ({ page, request }) => {
    const approval = await createApproval(request);

    await page.goto("/messages?thread=thr-cassidy");
    const composer = page.getByPlaceholder("iMessage");
    await expect(composer).toBeVisible();

    await composer.fill("status");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/servers up, \d+ open threats?, \d+ approvals? waiting/)).toBeVisible();

    await composer.fill(`Approve ${approval.id}`);
    await composer.press("Enter");
    await expect(page.getByText(new RegExp(`Approved ${approval.id} — block_egress for Sundance`))).toBeVisible();

    expect(await approvalStatus(request, approval.id)).toBe("approved");
  });
});
