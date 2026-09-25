import { expect, test, type Page } from "@playwright/test";

test("public home presents both identity intentions without creating a session", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
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

  const requester = await page.locator('.home-role[data-role="requester"]').boundingBox();
  const builder = await page.locator('.home-role[data-role="builder"]').boundingBox();
  expect(requester).not.toBeNull();
  expect(builder).not.toBeNull();
  expect(Math.abs(requester!.y - builder!.y)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("home-desktop.png") });
});

test("home stacks identity choices on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const requester = await page.locator('.home-role[data-role="requester"]').boundingBox();
  const builder = await page.locator('.home-role[data-role="builder"]').boundingBox();
  expect(requester).not.toBeNull();
  expect(builder).not.toBeNull();
  expect(builder!.y).toBeGreaterThan(requester!.y);
  expect(Math.abs(requester!.x - builder!.x)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("home-mobile.png"), fullPage: true });
});

test("home identity choices work with keyboard and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/__l5e/assets-v1/**", (route) => route.abort());
  const lovableAssetRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/__l5e/assets-v1/")) lovableAssetRequests.push(request.url());
  });
  await page.goto("/");

  const orbitDurations = await page.locator(".home-orbit").evaluateAll((orbits) =>
    orbits.map((orbit) => getComputedStyle(orbit).animationDuration),
  );
  expect(orbitDurations).toHaveLength(3);
  for (const duration of orbitDurations) {
    const value = Number.parseFloat(duration);
    const seconds = duration.endsWith("ms") ? value / 1000 : value;
    expect(seconds).toBeLessThanOrEqual(0.001);
  }

  // The brand, requester, then builder links are reachable in normal tab order.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "千轴首页" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /我是需求方/ })).toBeFocused();
  await page.keyboard.press("Tab");
  const builderLink = page.getByRole("link", { name: /我是开发者/ });
  await expect(builderLink).toBeFocused();

  // The current hero is CSS artwork and has no remote image/video dependency.
  await expect(page.locator("img, video, source")).toHaveCount(0);
  await expect(page.locator(".home-mechanical")).toBeVisible();
  const homeBackground = await page.locator(".qianzo-home").evaluate((home) =>
    getComputedStyle(home).backgroundImage,
  );
  expect(homeBackground).not.toContain("url(");
  expect(lovableAssetRequests).toEqual([]);
  await builderLink.press("Enter");
  await expect(page).toHaveURL(/\/sign-in\?intent=builder$/);
  await expect(page.getByLabel("邮箱")).toBeVisible();
});

async function expectNoHorizontalOverflow(page: Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
