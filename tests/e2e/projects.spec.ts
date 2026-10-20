import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { clearDemoBusinessData } from "../helpers/demo-data";
import { insertVisualDrafts } from "../helpers/ui-visual-fixtures";

const { tools, app } = loadLocalEnv(resolve(process.cwd()));
if (!tools.DEMO_USER_PASSWORD || !tools.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Run pnpm db:prepare and pnpm demo:seed before the project E2E tests.");
}

const authAdmin = createClient(
  requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  tools.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const adminSql = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
  max: 1,
  prepare: false,
});
let demoUserIds: string[] = [];
let enterpriseAUserId: string;
const builderOnlyEmail = `project-builder-${Date.now()}@qianzo.test`;
let builderOnlyUserId: string;

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/sign-in$/);
}

test.beforeAll(async () => {
  const { data, error } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const emails = new Set([
    "enterprise-a@qianzo.local",
    "enterprise-b@qianzo.local",
    "builder@qianzo.local",
  ]);
  demoUserIds = data.users.filter((user) => user.email && emails.has(user.email)).map((user) => user.id);
  if (demoUserIds.length !== 3) throw new Error("Run pnpm demo:seed before the project E2E tests.");
  enterpriseAUserId = data.users.find((user) => user.email === "enterprise-a@qianzo.local")!.id;
  await clearDemoBusinessData(adminSql, demoUserIds);
  const { data: builderUser, error: createError } = await authAdmin.auth.admin.createUser({
    email: builderOnlyEmail,
    password: tools.DEMO_USER_PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;
  builderOnlyUserId = builderUser.user.id;
  await adminSql`insert into app.users (id, display_name) values (${builderOnlyUserId}, '项目测试 Builder')`;
  await adminSql`insert into app.user_roles (user_id, role) values (${builderOnlyUserId}, 'BUILDER')`;
});

test.afterAll(async () => {
  if (demoUserIds.length) {
    await clearDemoBusinessData(adminSql, demoUserIds);
  }
  if (builderOnlyUserId) {
    await adminSql`delete from app.user_roles where user_id = ${builderOnlyUserId}`;
    await adminSql`delete from app.users where id = ${builderOnlyUserId}`;
    const { error } = await authAdmin.auth.admin.deleteUser(builderOnlyUserId);
    if (error) throw error;
  }
  await adminSql.end();
});

test("a draft persists while other enterprises and Builders remain isolated", async ({ browser, page }) => {
  test.setTimeout(60_000);
  await login(page, "enterprise-a@qianzo.local");
  await expect(page).toHaveURL(/\/enterprise\/projects$/);
  await expect(page.getByRole("heading", { name: "我的项目" })).toBeVisible();
  await expect(page.getByText("还没有项目，从一个想法开始。" )).toBeVisible();
  await expect(page.getByRole("link", { name: "开始需求" })).toHaveAttribute("href", "/enterprise/projects/new");
  await page.getByRole("link", { name: "开始需求" }).click();
  await expect(page.getByRole("heading", { name: "有什么想做的项目？" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  const inputPanel = await page.getByTestId("new-project-input-panel").boundingBox();
  const outlinePanel = await page.getByTestId("new-project-outline").boundingBox();
  expect(inputPanel).not.toBeNull();
  expect(outlinePanel).not.toBeNull();
  expect(outlinePanel!.x).toBeGreaterThan(inputPanel!.x);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("new-project-desktop.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: test.info().outputPath("new-project-tablet.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: test.info().outputPath("new-project-mobile.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("项目标题").fill("E2E 原始项目");
  await page.getByLabel("原始需求").fill("需要一个可持久化且隔离的草稿。");
  await page.getByRole("button", { name: "创建草稿" }).click();

  await expect(page).toHaveURL(/\/enterprise\/projects\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const projectUrl = new URL(page.url());
  const projectPath = projectUrl.pathname;
  await expect(page.getByRole("heading", { name: "E2E 原始项目" })).toBeVisible();
  await page.reload();
  await page.getByText("编辑项目说明", { exact: true }).click();
  await expect(page.getByLabel("项目标题")).toHaveValue("E2E 原始项目");

  await insertVisualDrafts(adminSql, enterpriseAUserId);
  await page.goto("/enterprise/projects");
  const projectRow = page.getByRole("link", { name: /E2E 原始项目/ });
  await expect(projectRow).toContainText("草稿");
  await expect(projectRow).toContainText("Spec 待整理");
  await expect(page.locator("main ul a")).toHaveCount(7);
  await expect(page.getByRole("navigation", { name: "项目状态筛选" })).toContainText(/全部\s*7/);
  await expect(page.getByRole("navigation", { name: "项目状态筛选" })).toContainText(/草稿\s*7/);
  await expect(page.getByRole("navigation", { name: "项目状态筛选" })).toContainText(/招募与进行中\s*0/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.fonts.ready);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: test.info().outputPath("my-projects-desktop.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: test.info().outputPath("my-projects-tablet.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: test.info().outputPath("my-projects-mobile.png"), fullPage: true, animations: "disabled" });
  await page.goto("/enterprise/projects?status=open");
  await expect(page.getByText("暂无招募与进行中项目。" )).toBeVisible();
  await expect(page.getByRole("link", { name: /E2E 原始项目/ })).toHaveCount(0);
  await page.goto("/enterprise/projects?status=draft");
  await expect(page.getByRole("link", { name: /E2E 原始项目/ })).toBeVisible();
  await expect(page.locator("main ul a")).toHaveCount(7);
  await page.goto(projectPath);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByText("成果提交与验收暂未开放。" )).toBeVisible();
  await expect(page.getByRole("button", { name: "验收" })).toBeDisabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("project-overview-desktop.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: test.info().outputPath("project-overview-tablet.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: test.info().outputPath("project-overview-mobile.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });

  const staleEditor = await page.context().newPage();
  await staleEditor.goto(projectPath);
  await expect(staleEditor.getByRole("heading", { name: "E2E 原始项目" })).toBeVisible();
  await staleEditor.getByText("编辑项目说明", { exact: true }).click();

  await page.getByText("编辑项目说明", { exact: true }).click();
  await page.getByLabel("项目标题").fill("窗口一保存成功");
  await page.getByLabel("原始需求").fill("第一个编辑窗口的内容必须保留。");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath.replaceAll("/", "\\/")}\\?saved=1$`));
  await expect(page.getByText("草稿已保存。")).toBeVisible();
  await expect(page.getByText(/项目版本 2/)).toBeVisible();

  await staleEditor.getByLabel("项目标题").fill("窗口二不应覆盖");
  await staleEditor.getByRole("button", { name: "保存草稿" }).click();
  await expect(staleEditor.locator('[data-error-code="VERSION_CONFLICT"]')).toContainText(
    "项目已被更新",
  );
  await page.reload();
  await page.getByText("编辑项目说明", { exact: true }).click();
  await expect(page.getByLabel("项目标题")).toHaveValue("窗口一保存成功");

  const enterpriseBContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const enterpriseBPage = await enterpriseBContext.newPage();
  await login(enterpriseBPage, "enterprise-b@qianzo.local");
  await expect(enterpriseBPage.getByText("窗口一保存成功")).toHaveCount(0);
  const forbiddenResponse = await enterpriseBPage.goto(projectPath);
  expect(forbiddenResponse?.status()).toBe(404);
  await enterpriseBPage.waitForLoadState("networkidle");
  await enterpriseBContext.close();

  const builderContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const builderPage = await builderContext.newPage();
  await login(builderPage, builderOnlyEmail);
  await builderPage.goto("/enterprise/projects/new");
  await expect(builderPage).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/projects$/);
  await expect(builderPage.getByRole("heading", { name: "项目大厅" })).toBeVisible();
  await builderContext.close();

  await page.getByRole("button", { name: "退出" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await login(page, "enterprise-a@qianzo.local");
  await page.goto(projectPath);
  await page.getByText("编辑项目说明", { exact: true }).click();
  await expect(page.getByLabel("项目标题")).toHaveValue("窗口一保存成功");
  await expect(page.getByText(/项目版本 2/)).toBeVisible();
});
