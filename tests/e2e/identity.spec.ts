import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";

const { tools, app } = loadLocalEnv(resolve(process.cwd()));

if (!tools.DEMO_USER_PASSWORD || !tools.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Run pnpm db:prepare before the identity E2E tests.");
}

const adminClient = createClient(
  requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  tools.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const adminSql = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
  max: 1,
  prepare: false,
});
const firstTimeEmail = `onboarding-${Date.now()}@qianzo.test`;
const repeatEmail = `repeat-onboarding-${Date.now()}@qianzo.test`;
const intentEmail = `requester-intent-${Date.now()}@qianzo.test`;
let firstTimeUserId: string;
let repeatUserId: string;
let intentUserId: string;

async function createAuthUser(email: string) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: tools.DEMO_USER_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

test.beforeAll(async () => {
  firstTimeUserId = await createAuthUser(firstTimeEmail);
  repeatUserId = await createAuthUser(repeatEmail);
  intentUserId = await createAuthUser(intentEmail);
  await adminSql`insert into app.users (id, display_name) values (${intentUserId}, '意图测试 Builder')`;
  await adminSql`insert into app.user_roles (user_id, role) values (${intentUserId}, 'BUILDER')`;
});

test.afterAll(async () => {
  for (const userId of [firstTimeUserId, repeatUserId, intentUserId]) {
    if (!userId) continue;
    await adminSql`delete from app.user_roles where user_id = ${userId}`;
    await adminSql`delete from app.users where id = ${userId}`;
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
  await adminSql.end();
});

test("a seeded Builder keeps a real session across refresh and can sign out", async ({ page }) => {
  await page.goto("/sign-in?intent=builder");

  await page.getByLabel("邮箱").fill("builder@qianzo.local");
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/projects$/);
  await expect(page.getByRole("heading", { name: "招募中的项目" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "招募中的项目" })).toBeVisible();

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
  await expect(page.getByText("ENTERPRISE WORKSPACE · 首次接入企业")).toBeVisible();
});

test("an onboarded user returns to onboarding to add the ENTERPRISE role", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(repeatEmail);
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("显示名").fill("再次设置用户");
  await page.getByRole("checkbox", { name: /Builder/ }).check();
  await page.getByRole("button", { name: "完成设置" }).click();

  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/projects$/);
  await page.goto("/onboarding");

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByLabel("显示名")).toHaveValue("再次设置用户");
  await expect(page.getByRole("checkbox", { name: /Builder/ })).toBeChecked();
  await expect(page.getByText("身份设置")).toBeVisible();
  await page.getByRole("checkbox", { name: /企业/ }).check();
  await page.getByRole("button", { name: "完成设置" }).click();

  await expect(page).toHaveURL(/\/enterprise\/projects$/);
  await expect(page.getByText("ENTERPRISE WORKSPACE · 再次设置用户")).toBeVisible();
});

test("requester intent survives login and directs a Builder to role onboarding", async ({ page }) => {
  await page.goto("/sign-in?intent=requester");
  await page.getByLabel("邮箱").fill(intentEmail);
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/onboarding\?intent=requester$/);
  await expect(page.getByRole("checkbox", { name: /企业/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Builder/ })).toBeChecked();
});
