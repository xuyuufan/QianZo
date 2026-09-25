import { expect, test, type Page } from "@playwright/test";

test("public home presents both identity intentions using the Lovable layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);

  await expect(page.getByRole("heading", { name: /从想法到交付.*每一步都有据可依/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /我是需求方/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /我是开发者/ })).toBeVisible();
  await expect(page.locator(".qianzo-home")).toHaveAttribute("data-scheme", "light");
  await expect(page.locator(".qianzo-home > img")).toHaveAttribute(
    "src",
    "/assets/qianzo-mechanical-light-poster.webp",
  );
  await expect(page.locator(".qianzo-home video source")).toHaveAttribute(
    "src",
    "/assets/qianzo-mechanical-light.mp4",
  );

  const requester = await page.locator('.role-entry[data-role="requester"]').boundingBox();
  const builder = await page.locator('.role-entry[data-role="builder"]').boundingBox();
  expect(requester).not.toBeNull();
  expect(builder).not.toBeNull();
  expect(Math.abs(requester!.y - builder!.y)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("home-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("home-tablet.png"), animations: "disabled" });
});

test("home keeps the original stacked identity rails on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const requester = await page.locator('.role-entry[data-role="requester"]').boundingBox();
  const builder = await page.locator('.role-entry[data-role="builder"]').boundingBox();
  expect(requester).not.toBeNull();
  expect(builder).not.toBeNull();
  expect(builder!.y).toBeGreaterThan(requester!.y);
  expect(Math.abs(requester!.x - builder!.x)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("home-mobile.png"), fullPage: true, animations: "disabled" });
});

test("home retains the poster when the local video cannot load", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/assets/qianzo-mechanical-light.mp4", (route) => route.abort());
  await page.goto("/");
  const video = page.locator(".qianzo-film");
  await expect(video).toBeHidden();
  const posterLoaded = await page.locator(".qianzo-home > img").evaluate((image: HTMLImageElement) => image.naturalWidth > 0);
  expect(posterLoaded).toBe(true);
});

test("home role selection preserves keyboard access, transition and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/assets/qianzo-mechanical-light.mp4", (route) => route.abort());
  const localVideoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/assets/qianzo-mechanical-light.mp4")) localVideoRequests.push(request.url());
  });
  await page.goto("/");

  await expect(page.locator(".qianzo-home > img")).toBeVisible();
  const posterLoaded = await page.locator(".qianzo-home > img").evaluate((image: HTMLImageElement) => image.naturalWidth > 0);
  expect(posterLoaded).toBe(true);
  await expect(page.locator(".qianzo-film")).toBeHidden();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "千轴首页" })).toBeFocused();
  await page.keyboard.press("Tab");
  const requesterButton = page.getByRole("button", { name: /我是需求方/ });
  await expect(requesterButton).toBeFocused();
  await page.keyboard.press("Tab");
  const builderButton = page.getByRole("button", { name: /我是开发者/ });
  await expect(builderButton).toBeFocused();

  await builderButton.press("Enter");
  await expect(page.locator(".qz-transition")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\?intent=builder$/);
  await expect(page.getByLabel("邮箱")).toBeVisible();
  expect(localVideoRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});

test("sign-in intent and original narrow card keep the real auth form", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in?intent=requester");

  await expect(page.getByRole("heading", { name: "开始你的项目" })).toBeVisible();
  await expect(page.locator("main")).toHaveClass(/mt-10/);
  await expect(page.getByLabel("邮箱")).toHaveAttribute("name", "email");
  await expect(page.getByLabel("密码")).toHaveAttribute("name", "password");
  await expect(page.locator('input[name="intent"]')).toHaveValue("requester");
  await expect(page.getByText("SECURE ACCESS")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("sign-in-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("sign-in-tablet.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("sign-in-mobile.png"), fullPage: true, animations: "disabled" });
});

async function expectNoHorizontalOverflow(page: Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
