import { expect, test } from "@playwright/test";

test.describe("Homepage", () => {
  test("should load homepage successfully", async ({ page }) => {
    const response = await page.goto("/");

    // Check that the page loads with a successful status code
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    // Verify page has content
    const bodyContent = await page.locator("body").textContent();
    expect(bodyContent).toBeTruthy();
    expect(bodyContent!.length).toBeGreaterThan(0);
  });

  test("should have a valid HTML structure", async ({ page }) => {
    await page.goto("/");

    // Verify basic HTML structure exists
    await expect(page.locator("html")).toBeVisible();
    await expect(page.locator("body")).toBeVisible();
  });
});
