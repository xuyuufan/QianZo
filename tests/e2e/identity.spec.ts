import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { parse } from "dotenv";
import postgres from "postgres";

const root = resolve(process.cwd());
const tools = parse(readFileSync(resolve(root, ".env.tools.local"), "utf8"));
const app = parse(readFileSync(resolve(root, ".env.local"), "utf8"));

if (!tools.DEMO_USER_PASSWORD || !tools.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Run pnpm db:prepare before the identity E2E tests.");
}

const adminClient = createClient(
  app.NEXT_PUBLIC_SUPABASE_URL,
  tools.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const adminSql = postgres(tools.SUPABASE_DB_ADMIN_URL, { max: 1, prepare: false });
const firstTimeEmail = `onboarding-${Date.now()}@qianzo.test`;
let firstTimeUserId: string;

test.beforeAll(async () => {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: firstTimeEmail,
    password: tools.DEMO_USER_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  firstTimeUserId = data.user.id;
});

test.afterAll(async () => {
  if (firstTimeUserId) {
    await adminSql`delete from app.user_roles where user_id = ${firstTimeUserId}`;
    await adminSql`delete from app.users where id = ${firstTimeUserId}`;
    const { error } = await adminClient.auth.admin.deleteUser(firstTimeUserId);
    if (error) throw error;
  }
  await adminSql.end();
});

test("a seeded Builder keeps a real session across refresh and can sign out", async ({ page }) => {
  await page.goto("/enterprise/projects");
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("邮箱").fill("builder@qianzo.local");
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "已登录" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "已登录" })).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/enterprise/projects");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a first-time Auth user completes onboarding through the real UI", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(firstTimeEmail);
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("显示名").fill("首次接入企业");
  await page.getByRole("checkbox", { name: /企业/ }).check();
  await page.getByRole("button", { name: "完成设置" }).click();

  await expect(page).toHaveURL(/\/enterprise\/projects$/);
  await expect(page.getByText("你好，首次接入企业")).toBeVisible();
});
