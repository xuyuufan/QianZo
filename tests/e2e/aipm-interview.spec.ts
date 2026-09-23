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

test("an enterprise interviews with the mock AIPM and reviews the stored candidate", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
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
  await expect(page.getByRole("heading", { name: "最新候选 Spec（只读预览）" })).toBeVisible();
  await expect(page.getByText("里程碑与验收")).toBeVisible();
  await expect(page.getByText("第 14 个自然日")).toBeVisible();

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
