import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { clearDemoBusinessData } from "../helpers/demo-data";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { validSpecDocument } from "../helpers/spec-fixture";

const { tools, app } = loadLocalEnv(resolve(process.cwd()));
if (!tools.DEMO_USER_PASSWORD || !tools.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Run pnpm db:prepare before the applications E2E test.");
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
const runId = Date.now();
const emails = {
  enterprise: `s2-enterprise-${runId}@qianzo.test`,
  otherEnterprise: `s2-other-enterprise-${runId}@qianzo.test`,
  builder: `s2-builder-${runId}@qianzo.test`,
  otherBuilder: `s2-other-builder-${runId}@qianzo.test`,
};
let userIds: string[] = [];
let projectId: string;

async function createAuthUser(email: string) {
  const { data, error } = await authAdmin.auth.admin.createUser({
    email,
    password: tools.DEMO_USER_PASSWORD!,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function login(page: Page, email: string, intent: "requester" | "builder") {
  await page.goto(`/sign-in?intent=${intent}`);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/sign-in(?:\?|$)/);
}

test.beforeAll(async () => {
  userIds = await Promise.all(Object.values(emails).map(createAuthUser));
  await clearDemoBusinessData(adminSql, userIds);
  const roleRows = [
    [userIds[0], "S2 E2E 企业", ["ENTERPRISE", "BUILDER"]],
    [userIds[1], "S2 E2E 其他企业", ["ENTERPRISE"]],
    [userIds[2], "S2 E2E Builder", ["BUILDER", "ENTERPRISE"]],
    [userIds[3], "S2 E2E 其他 Builder", ["BUILDER"]],
  ] as const;
  for (const [userId, displayName, roles] of roleRows) {
    await adminSql`insert into app.users (id, display_name) values (${userId}, ${displayName})`;
    for (const role of roles) {
      await adminSql`insert into app.user_roles (user_id, role) values (${userId}, ${role})`;
    }
  }

  projectId = randomUUID();
  const specVersionId = randomUUID();
  const document = validSpecDocument();
  const snapshot = {
    schemaVersion: 1,
    lockedSpecVersionId: specVersionId,
    title: "S2 公开申请项目",
    budget: { minMinor: 100000, maxMinor: 250000, currency: "CNY" },
    document,
  };
  await adminSql.begin(async (transaction) => {
    await transaction`insert into app.projects (id, owner_id, title, original_requirement)
      values (${projectId}, ${userIds[0]}, 'PRIVATE-S2 合成项目', 'PRIVATE-S2 原始需求不应展示给申请人。')`;
    await transaction`insert into app.spec_versions (id, project_id, version_no, schema_version, content, created_by)
      values (${specVersionId}, ${projectId}, 1, 1, ${transaction.json(document)}, ${userIds[0]})`;
    await transaction`update app.projects
      set current_spec_version_id = ${specVersionId},
          budget_min_minor = 100000,
          budget_max_minor = 250000,
          currency = 'CNY',
          locked_spec_version_id = ${specVersionId},
          locked_at = now(),
          status = 'OPEN',
          published_spec_snapshot = ${transaction.json(snapshot)},
          published_at = now(),
          version = 4
      where id = ${projectId}`;
  });
  // The already-published application needs its enterprise deposit, but the
  // Builder deposit and project start below must happen through the UI.
  await adminSql`
    insert into app.payments (id, project_id, payer_id, purpose, amount_minor, currency, status, succeeded_at)
    values (${randomUUID()}, ${projectId}, ${userIds[0]}, 'ENTERPRISE_DEPOSIT', 100, 'CNY', 'SUCCEEDED', now())
  `;
});

test.afterAll(async () => {
  if (userIds.length) {
    await clearDemoBusinessData(adminSql, userIds);
    await adminSql`delete from app.user_roles where user_id in ${adminSql(userIds)}`;
    await adminSql`delete from app.users where id in ${adminSql(userIds)}`;
    for (const userId of userIds) {
      const { error } = await authAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  }
  await adminSql.end();
});

test("a Builder applies, the project owner selects them, and private application data stays scoped", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const statement = "I have shipped similar workflow tools and can deliver the core flow.";
  const otherBuilderPage = await browser.newPage();
  const otherEnterprisePage = await browser.newPage();
  const enterprisePage = await browser.newPage();

  try {
    await login(page, emails.builder, "builder");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("heading", { name: "S2 公开申请项目" })).toBeVisible();
    await expect(page.getByLabel("简要介绍你适合这个项目的经验")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await page.getByLabel("简要介绍你适合这个项目的经验").fill(statement);
    await page.getByRole("button", { name: "提交申请" }).click();
    await expect(page.getByRole("status")).toContainText("你已提交申请");
    await expect(page.getByRole("status").getByRole("link", { name: "查看我的申请" })).toBeVisible();
    await page.goto("/builder/applications");
    await expect(page.getByRole("heading", { name: "S2 公开申请项目" })).toBeVisible();
    await expect(page.getByText(statement)).toBeVisible();
    await expect(page.getByTestId("application-status")).toHaveText("等待企业选择");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );

    await login(otherBuilderPage, emails.otherBuilder, "builder");
    await otherBuilderPage.goto("/builder/applications");
    await expect(otherBuilderPage.getByText("还没有提交申请。")).toBeVisible();
    await otherBuilderPage.goto(`/projects/${projectId}`);
    await expect(otherBuilderPage.getByText(statement)).toHaveCount(0);
    await expect(otherBuilderPage.getByText("PRIVATE-S2 原始需求")).toHaveCount(0);

    await login(otherEnterprisePage, emails.otherEnterprise, "requester");
    const hiddenResponse = await otherEnterprisePage.goto(
      `/enterprise/projects/${projectId}/applications`,
    );
    expect(hiddenResponse?.status()).toBe(404);
    await expect(otherEnterprisePage.getByText(statement)).toHaveCount(0);

    await login(enterprisePage, emails.enterprise, "requester");
    await enterprisePage.goto(`/enterprise/projects/${projectId}`);
    await enterprisePage.getByRole("link", { name: "查看申请", exact: true }).click();
    await expect(enterprisePage).toHaveURL(new RegExp(`/enterprise/projects/${projectId}/applications$`));
    await expect(enterprisePage.getByText("S2 E2E Builder")).toBeVisible();
    await expect(enterprisePage.getByText(statement)).toBeVisible();
    await enterprisePage.getByRole("button", { name: "选择 Builder" }).click();
    await expect(enterprisePage.getByRole("status")).toContainText("等待其完成 Mock 押金");
    await expect(enterprisePage.getByTestId("application-status")).toHaveText("已选择 · 等待 Builder Mock 押金");

    await page.reload();
    await expect(page.getByTestId("application-status")).toHaveText("已被选择 · 等待 Mock 押金");
    await expect(page.getByRole("heading", { name: "Builder Mock 押金 · ¥1.00" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await page.getByRole("button", { name: "创建 Builder 模拟押金" }).click();
    await expect(page.getByTestId("builder-deposit-status")).toContainText("等待你完成模拟支付");
    await page.getByRole("button", { name: "模拟押金支付成功" }).click();
    await expect(page.getByTestId("application-status")).toHaveText("已开工");
    await page.reload();
    await expect(page.getByTestId("application-status")).toHaveText("已开工");
    const builderWorkspaceLink = page.getByRole("link", { name: "进入 Workspace →" });
    await expect(builderWorkspaceLink).toBeVisible();
    await builderWorkspaceLink.click();
    await expect(page.getByRole("heading", { name: "S2 公开申请项目" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "项目里程碑" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "开发者导航" })).toBeVisible();
    const builderReturnLink = page.getByRole("link", { name: "返回我的申请" });
    await expect(builderReturnLink).toHaveAttribute("href", "/builder/applications");
    await expect(page.getByText(/PRIVATE-S2 原始需求/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /提交成果|验收/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "项目里程碑" })).toBeVisible();
    await builderReturnLink.click();
    await expect(page).toHaveURL("/builder/applications");
    await expect(page.getByRole("heading", { name: "我的申请" })).toBeVisible();
    await expect(page.getByRole("link", { name: "进入 Workspace →" })).toBeVisible();
    await page.getByRole("link", { name: "进入 Workspace →" }).click();
    await expect(page.getByRole("heading", { name: "项目里程碑" })).toBeVisible();

    await enterprisePage.goto(`/enterprise/projects/${projectId}/applications`);
    await expect(enterprisePage.getByRole("status")).toContainText("项目已开工");
    await enterprisePage.getByRole("link", { name: "进入 Workspace →" }).click();
    await expect(enterprisePage.getByRole("heading", { name: "S2 公开申请项目" })).toBeVisible();
    await expect(enterprisePage.getByRole("navigation", { name: "需求方导航" })).toBeVisible();
    await expect(enterprisePage.getByRole("link", { name: "返回项目列表" })).toHaveAttribute(
      "href",
      "/enterprise/projects",
    );
    await enterprisePage.goto(`/enterprise/projects/${projectId}`);
    await expect(enterprisePage.getByText("项目已开工", { exact: false }).first()).toBeVisible();
    await expect(enterprisePage.getByRole("link", { name: "进入 Workspace" })).toBeVisible();
    await enterprisePage.goto(`/enterprise/projects/${projectId}/publish`);
    await expect(enterprisePage.getByText("状态 进行中")).toBeVisible();
    await expect(enterprisePage.getByRole("link", { name: "进入 Workspace →" })).toBeVisible();
    await enterprisePage.goto(`/enterprise/projects/${projectId}/spec`);
    await expect(enterprisePage.getByText("项目进行中", { exact: true })).toBeVisible();
    await expect(enterprisePage.getByRole("link", { name: "进入 Workspace →" })).toBeVisible();
    await enterprisePage.goto("/enterprise/projects");
    await expect(enterprisePage.getByText("进行中", { exact: true })).toBeVisible();
    await expect(enterprisePage.getByRole("link", { name: "进入 Workspace →" })).toBeVisible();

    const hiddenBuilderWorkspace = await otherBuilderPage.goto(`/projects/${projectId}/workspace`);
    expect(hiddenBuilderWorkspace?.status()).toBe(404);
    await expect(otherBuilderPage.getByText("S2 公开申请项目")).toHaveCount(0);
    const hiddenEnterpriseWorkspace = await otherEnterprisePage.goto(`/projects/${projectId}/workspace`);
    expect(hiddenEnterpriseWorkspace?.status()).toBe(404);
    await expect(otherEnterprisePage.getByText("S2 公开申请项目")).toHaveCount(0);
  } finally {
    await Promise.all([
      otherBuilderPage.close(),
      otherEnterprisePage.close(),
      enterprisePage.close(),
    ]);
  }
});
