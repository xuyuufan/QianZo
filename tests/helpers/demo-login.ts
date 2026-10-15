import { expect, type Page } from "@playwright/test";

/** Signs a synthetic demo user in through the real sign-in form. */
export async function loginDemoUser(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/sign-in$/);
}
