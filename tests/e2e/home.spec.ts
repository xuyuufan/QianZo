import { expect, test } from "@playwright/test";

test("public home presents both identity intentions without creating a session", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /从想法到交付.*每一步都有据可依/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /我是需求方/ })).toHaveAttribute(
    "href",
    "/sign-in?intent=requester",
  );
  await expect(page.getByRole("link", { name: /我是开发者/ })).toHaveAttribute(
    "href",
    "/sign-in?intent=builder",
  );
  await expect(page.getByRole("link", { name: /我是开发者/ })).toBeVisible();
});
