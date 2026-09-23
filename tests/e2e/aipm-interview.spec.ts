import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { clearDemoBusinessData } from "../helpers/demo-data";
import { loginDemoUser } from "../helpers/demo-login";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";

const { tools, app } = loadLocalEnv(resolve(process.cwd()));
if (!tools.DEMO_USER_PASSWORD || !tools.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Run pnpm db:prepare and pnpm demo:seed before the interview E2E test.");
}

const authAdmin = createClient(
  requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  tools.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const adminSql = postgres(
  requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"),
  { max: 1, prepare: false },
);
let demoUserIds: string[] = [];

test.beforeAll(async () => {
  const { data, error } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const emails = new Set([
    "enterprise-a@qianzo.local",
    "enterprise-b@qianzo.local",
    "builder@qianzo.local",
  ]);
  demoUserIds = data.users.filter((user) => user.email && emails.has(user.email)).map((user) => user.id);
  if (demoUserIds.length !== 3) throw new Error("Run pnpm demo:seed before the interview E2E test.");
  await clearDemoBusinessData(adminSql, demoUserIds);
});

test.afterAll(async () => {
  if (demoUserIds.length) {
    await clearDemoBusinessData(adminSql, demoUserIds);
  }
  await adminSql.end();
});

test("an enterprise interviews, adopts a candidate and keeps the version history", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const password = tools.DEMO_USER_PASSWORD;

  await loginDemoUser(page, "enterprise-a@qianzo.local", password);
  await page.getByRole("link", { name: "创建项目" }).click();
  await page.getByLabel("项目标题").fill("E2E 访谈项目");
  await page.getByLabel("原始需求").fill("需要把访谈整理成可招募的确认范围。");
  await page.getByRole("button", { name: "创建草稿" }).click();
  await expect(page).toHaveURL(/\/enterprise\/projects\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const projectPath = new URL(page.url()).pathname;

  await page.getByRole("link", { name: "需求访谈与 Spec" }).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath.replaceAll("/", "\\/")}/spec$`));

  await page
    .getByLabel("访谈回复")
    .fill("我们希望把模糊需求整理成可招募的确认范围，并按里程碑逐条验收。");
  await page.getByRole("button", { name: "发送访谈回复" }).click();
  await expect(page.getByText("已收到访谈回复。")).toBeVisible();
  await expect(page.locator('li[data-role="ASSISTANT"]')).toHaveCount(1);

  // The transcript is persisted, not just rendered.
  await page.reload();
  await expect(page.locator('li[data-role="USER"]')).toHaveCount(1);
  await expect(page.locator('li[data-role="ASSISTANT"]')).toHaveCount(1);

  await page
    .getByLabel("访谈回复")
    .fill("功能范围是需求整理、范围确认与锁定；验收标准按里程碑逐条核对。");
  await page.getByRole("button", { name: "生成候选 Spec" }).click();
  await expect(page.getByText("候选 Spec 已生成，可在下方预览。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "最新候选 Spec" })).toBeVisible();
  await expect(page.getByText("里程碑与验收")).toBeVisible();
  await expect(page.getByText("第 14 个自然日")).toBeVisible();

  // Adopt the candidate into the first immutable version.
  await page.getByRole("button", { name: "采用为当前 Spec 版本" }).click();
  await expect(page.getByText("该候选已采用为版本 1，历史版本不会被覆盖。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spec 版本 1（当前）" })).toBeVisible();
  await expect(page.getByText("当前 Spec 版本 1")).toBeVisible();

  // A manual save always appends: the earlier version stays readable.
  const editor = page.getByLabel("Spec 文档（JSON）");
  await expect(editor).toHaveValue(/我们希望把模糊需求整理成可招募的确认范围/);
  const editedContent = (await editor.inputValue()).replace(
    "我们希望把模糊需求",
    "手工编辑后：我们希望把模糊需求",
  );
  await editor.fill(editedContent);
  await page.getByRole("button", { name: "保存为新版本" }).click();
  await expect(page.getByText("已保存为版本 2。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spec 版本 2（当前）" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: "版本 2" })).toBeVisible();
  await page.getByRole("link", { name: "版本 1" }).click();
  const reviewedVersion = page.getByTestId("spec-version-detail");
  await expect(reviewedVersion.getByText("这是历史版本，不会被修改")).toBeVisible();
  // The first version still holds what was adopted, not the later edit; the
  // editor below it always starts from the current version.
  await expect(reviewedVersion.getByText("手工编辑后：")).toHaveCount(0);
  await expect(
    reviewedVersion.getByText("我们希望把模糊需求整理成可招募的确认范围，并按里程碑逐条验收。"),
  ).toHaveCount(1);

  // Reference budget lives on the project overview and is saved exactly.
  await page.getByRole("link", { name: "← 返回项目总览" }).click();
  await page.getByLabel("参考预算下限（CNY）").fill("1000");
  await page.getByLabel("参考预算上限（CNY）").fill("2500.50");
  await page.getByRole("button", { name: "保存参考预算" }).click();
  await expect(page.getByText(/参考预算已保存：¥1000\.00 – ¥2500\.50/)).toBeVisible();

  // Locking freezes the reviewed scope.
  await page.getByRole("link", { name: "需求访谈与 Spec" }).click();
  await page.getByRole("button", { name: "确认锁定当前版本" }).click();
  await expect(page.getByText(/已锁定 Spec 版本 2/)).toBeVisible();
  await expect(
    page.getByText("Spec 已锁定，访谈与候选生成已关闭。已有的对话与历史版本仍可查看。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "确认锁定当前版本" })).toHaveCount(0);

  // The original draft entry point can no longer rewrite the frozen scope.
  await page.getByRole("link", { name: "← 返回项目总览" }).click();
  await expect(page.getByText(/已锁定 Spec 版本：标题、原始需求与参考预算已冻结/)).toBeVisible();
  await page.getByLabel("项目标题").fill("锁定后改名");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator('[data-error-code="SPEC_LOCKED"]')).toContainText("已锁定评审范围");

  const privateMessage = "我们希望把模糊需求整理成可招募的确认范围，并按里程碑逐条验收。";
  const specPath = `${projectPath}/spec`;

  const enterpriseBContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const enterpriseBPage = await enterpriseBContext.newPage();
  await loginDemoUser(enterpriseBPage, "enterprise-b@qianzo.local", password);
  const forbidden = await enterpriseBPage.goto(specPath);
  expect(forbidden?.status()).toBe(404);
  await enterpriseBPage.waitForLoadState("networkidle");
  await expect(enterpriseBPage.getByText(privateMessage)).toHaveCount(0);
  await enterpriseBContext.close();

  const builderContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const builderPage = await builderContext.newPage();
  await loginDemoUser(builderPage, "builder@qianzo.local", password);
  await builderPage.goto(specPath);
  await expect(builderPage).toHaveURL(/\/$/);
  await builderContext.close();
});
