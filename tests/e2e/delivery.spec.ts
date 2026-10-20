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

const { tools, app } = loadLocalEnv(resolve(process.cwd()));
if (!tools.DEMO_USER_PASSWORD || !tools.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Run pnpm db:prepare before the delivery E2E test.");
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
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const enterpriseEmail = `s3-enterprise-${suffix}@qianzo.test`;
const builderEmail = `s3-builder-${suffix}@qianzo.test`;
const userIds: string[] = [];

async function loginAndOnboard(
  page: Page,
  email: string,
  displayName: string,
  role: "ENTERPRISE" | "BUILDER",
) {
  const intent = role === "ENTERPRISE" ? "requester" : "builder";
  await page.goto(`/sign-in?intent=${intent}`);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(tools.DEMO_USER_PASSWORD!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/onboarding(?:\?intent=(?:requester|builder))?$/);
  await page.getByLabel("显示名").fill(displayName);
  const enterpriseRole = page.getByRole("checkbox", { name: /企业/ });
  const builderRole = page.getByRole("checkbox", { name: /Builder/ });
  if (role === "ENTERPRISE") {
    await enterpriseRole.check();
    await expect(builderRole).not.toBeChecked();
  } else {
    await builderRole.check();
    await expect(enterpriseRole).not.toBeChecked();
  }
  await page.getByRole("button", { name: "完成设置" }).click();
  await expect(page).toHaveURL(role === "ENTERPRISE" ? /\/enterprise\/projects$/ : /\/projects$/);
}

async function createAuthUser(email: string) {
  const { data, error } = await authAdmin.auth.admin.createUser({
    email,
    password: tools.DEMO_USER_PASSWORD!,
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
}

async function expectNoHorizontalOverflow(page: Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.beforeAll(async () => {
  await createAuthUser(enterpriseEmail);
  await createAuthUser(builderEmail);
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

test("creates, publishes, delivers, revises, accepts and completes one milestone through the UI", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const builderContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const builderPage = await builderContext.newPage();
  const enterpriseRequirement = "ZZSECRET-S3-原始需求：整理真实流程并保留企业私有范围。";
  const privateInterview = "ZZSECRET-S3-访谈记录不应进入公开页面或 Workspace。";
  const injectedText = "<script>window.__qzS3Injected=true</script> 第一轮提交内容";
  const privateIds: string[] = [];
  const flightBodies: string[] = [];
  let projectPath = "";
  let workspacePath = "";

  try {
    // S0: create a new draft and complete the interview in the real UI.
    await loginAndOnboard(page, enterpriseEmail, "S3 合成企业", "ENTERPRISE");
    await page.getByRole("link", { name: "开始需求" }).click();
    await page.getByLabel("项目标题").fill("S3 一里程碑交付闭环");
    await page.getByLabel("原始需求").fill(enterpriseRequirement);
    await page.getByRole("button", { name: "创建草稿" }).click();
    await expect(page).toHaveURL(/\/enterprise\/projects\/[0-9a-f-]{36}$/);
    projectPath = new URL(page.url()).pathname;
    const projectId = projectPath.split("/").pop()!;
    await page.getByRole("link", { name: "需求访谈与 Spec" }).click();
    await page.getByLabel("访谈回复").fill(privateInterview);
    await page.getByRole("button", { name: "发送访谈回复" }).click();
    await expect(page.getByText("已收到访谈回复。")).toBeVisible();
    await page.getByLabel("访谈回复").fill("请明确首个交付结果、角色权限和逐条验收方法。");
    await page.getByRole("button", { name: "生成候选 Spec" }).click();
    await expect(page.getByText("候选 Spec 已生成，可在下方预览。")).toBeVisible();
    await page.getByRole("tab", { name: "访谈候选" }).click();
    await expect(page.getByRole("button", { name: "采用为当前 Spec 版本" })).toBeVisible();
    await page.getByRole("button", { name: "采用为当前 Spec 版本" }).click();
    await expect(page.getByText(/已采用为版本 1/)).toBeVisible();

    // S1: edit the generated plan to one milestone, then save and lock it.
    await page.getByRole("tab", { name: "编辑 Spec" }).click();
    const editor = page.getByTestId("structured-spec-editor");
    const milestoneCards = editor.locator("#edit-milestones .milestone-edit-card");
    let milestoneCount = await milestoneCards.count();
    expect(milestoneCount).toBeGreaterThan(0);
    let changedMilestones = false;
    while (milestoneCount > 1) {
      const lastMilestone = milestoneCards.nth(milestoneCount - 1);
      const milestoneId = (await lastMilestone.locator("code").first().innerText()).trim();
      await editor.getByRole("button", { name: `删除 ${milestoneId}` }).click();
      milestoneCount = await milestoneCards.count();
      changedMilestones = true;
    }
    expect(milestoneCount).toBe(1);
    if (changedMilestones) {
      await editor.getByRole("button", { name: "保存为新版本" }).click();
      await expect(page.getByText("已保存为版本 2。")).toBeVisible();
    }

    await page.getByRole("link", { name: "← 返回项目总览" }).click();
    await page.getByText("补充参考预算", { exact: true }).click();
    await page.getByLabel("参考预算下限（CNY）").fill("1000");
    await page.getByLabel("参考预算上限（CNY）").fill("2500");
    await page.getByRole("button", { name: "保存参考预算" }).click();
    await expect(page.getByText(/参考预算已保存/)).toBeVisible();
    await page.getByRole("link", { name: "需求访谈与 Spec" }).click();
    await page.getByText("核对将要锁定的内容").click();
    await page.getByRole("checkbox", { name: /我已核对标题、原始需求、参考预算和 Spec v\d+/ }).check();
    await page.getByRole("button", { name: "确认锁定当前版本" }).click();
    await expect(page.getByText(/已锁定 Spec 版本/)).toBeVisible();
    await page.getByRole("link", { name: "← 返回项目总览" }).click();
    await expect(page.getByRole("heading", { name: "S3 一里程碑交付闭环" })).toBeVisible();

    const [lockedProject] = await adminSql<{ locked_spec_version_id: string }[]>`
      select locked_spec_version_id from app.projects where id = ${projectId}
    `;
    if (!lockedProject?.locked_spec_version_id) throw new Error("The S1 lock did not persist.");
    privateIds.push(lockedProject.locked_spec_version_id);
    // S1 publish: complete the local Mock deposit and confirm the masked preview.
    await page.getByRole("link", { name: "Mock 定金与发布" }).click();
    await page.getByRole("button", { name: "创建企业模拟定金" }).click();
    await expect(page.getByText(/已创建企业模拟定金/)).toBeVisible();
    await page.getByRole("button", { name: "模拟支付成功" }).click();
    await expect(page.getByText(/发布仍需你在脱敏预览后手动确认/)).toBeVisible();
    await page.getByRole("tab", { name: "最终招募预览" }).click();
    await page.getByRole("checkbox", { name: /我已确认这是最终预览/ }).check();
    await page.getByRole("button", { name: "确认并发布招募" }).click();
    await expect(page.getByRole("heading", { name: "已发布" })).toBeVisible();

    // S2: a newly onboarded Builder applies, is selected, and pays the local Mock deposit.
    await loginAndOnboard(builderPage, builderEmail, "S3 合成 Builder", "BUILDER");
    await builderPage.goto(`/projects/${projectId}`);
    await expect(builderPage.getByRole("heading", { name: "S3 一里程碑交付闭环" })).toBeVisible();
    await builderPage.getByLabel("简要介绍你适合这个项目的经验").fill("我可以交付并逐项验证首个里程碑。");
    await builderPage.getByRole("button", { name: "提交申请" }).click();
    await expect(builderPage.getByRole("status")).toContainText("你已提交申请");

    await page.goto(`${projectPath}/applications`);
    await expect(page.getByText("S3 合成 Builder")).toBeVisible();
    await page.getByRole("button", { name: "选择 Builder" }).click();
    await expect(page.getByRole("status")).toContainText("等待其完成 Mock 押金");
    await builderPage.goto("/builder/applications");
    await expect(builderPage.getByRole("button", { name: "创建 Builder 模拟押金" })).toBeVisible();
    await builderPage.getByRole("button", { name: "创建 Builder 模拟押金" }).click();
    await expect(builderPage.getByTestId("builder-deposit-status")).toContainText("等待你完成模拟支付");
    await builderPage.getByRole("button", { name: "模拟押金支付成功" }).click();
    await expect(builderPage.getByTestId("application-status")).toHaveText("已开工");

    const criterionRows = await adminSql<{ id: string }[]>`
      select criterion.value ->> 'id' as id
      from app.milestones as milestone
      cross join lateral jsonb_array_elements(milestone.acceptance_criteria) as criterion(value)
      where milestone.project_id = ${projectId}
    `;
    expect(criterionRows.length).toBeGreaterThan(0);
    privateIds.push(...criterionRows.map((row) => row.id).filter(Boolean));

    // S3: submit a real UI payload and prove HTML/Flight never expose private Spec data.
    workspacePath = `/projects/${projectId}/workspace`;
    await builderPage.setViewportSize({ width: 390, height: 844 });
    await page.setViewportSize({ width: 390, height: 844 });
    const workspaceResponse = await builderPage.goto(workspacePath);
    const workspaceHtml = (await workspaceResponse?.text()) ?? "";
    for (const secret of [enterpriseRequirement, privateInterview, ...privateIds]) {
      expect(workspaceHtml).not.toContain(secret);
    }
    await expect(builderPage.getByRole("heading", { name: "S3 一里程碑交付闭环" })).toBeVisible();
    await expect(builderPage.getByRole("heading", { name: "项目里程碑" })).toBeVisible();
    await expect(builderPage.getByLabel("成果链接 1")).toBeVisible();
    await expectNoHorizontalOverflow(builderPage);
    await builderPage.getByLabel("本轮交付说明").fill(injectedText);
    await builderPage.getByLabel("成果链接 1").fill("https://example.com/first");
    await builderPage.getByRole("button", { name: "提交成果链接" }).click();
    await expect(builderPage.getByText("待验收", { exact: true })).toBeVisible();
    await expect(builderPage.getByText(injectedText, { exact: true })).toBeVisible();
    expect(await builderPage.evaluate(() => Boolean((window as Window & { __qzS3Injected?: boolean }).__qzS3Injected))).toBe(false);
    const submittedHtmlResponse = await builderPage.goto(workspacePath);
    const submittedHtml = (await submittedHtmlResponse?.text()) ?? "";
    for (const secret of [enterpriseRequirement, privateInterview, ...privateIds]) {
      expect(submittedHtml).not.toContain(secret);
    }
    expect(submittedHtml).not.toContain(injectedText);
    expect(submittedHtml).toContain("&lt;script&gt;");
    await expect(builderPage.getByText(injectedText, { exact: true })).toBeVisible();
    expect(await builderPage.evaluate(() => Boolean((window as Window & { __qzS3Injected?: boolean }).__qzS3Injected))).toBe(false);

    await page.goto(workspacePath);
    await expect(page.getByRole("heading", { name: "逐条验收" })).toBeVisible();
    await expect(page.locator('select[name="criterionResult"]')).toHaveCount(1);
    await page.locator('select[name="criterionResult"]').selectOption("1:FAIL");
    await page.getByLabel("返工原因（存在 FAIL 时必填）").fill("需要补齐验收演示，并修复一处边界条件。");
    await page.getByRole("button", { name: "保存验收结果" }).click();
    await expect(page.getByText("需返工", { exact: true })).toBeVisible();
    await expect(page.getByText("返工原因：需要补齐验收演示，并修复一处边界条件。")).toBeVisible();

    // Re-enter after FAIL, change the payload and submit exactly once with the new attempt key.
    await builderPage.reload();
    await expect(builderPage.getByLabel("本轮交付说明")).toBeVisible();
    await expectNoHorizontalOverflow(builderPage);
    await builderPage.getByLabel("本轮交付说明").fill("第二轮提交：补齐演示与边界验证。");
    await builderPage.getByLabel("成果链接 1").fill("https://example.com/second");
    await builderPage.getByRole("button", { name: "提交成果链接" }).click();
    await expect(builderPage.getByText("待验收", { exact: true })).toBeVisible();
    await expect(builderPage.getByText("第 1 次提交", { exact: true })).toBeVisible();
    await expect(builderPage.getByText("第 2 次提交", { exact: true })).toBeVisible();

    await page.goto(workspacePath);
    await expect(page.getByRole("heading", { name: "逐条验收" })).toBeVisible();
    await page.getByRole("button", { name: "保存验收结果" }).click();
    await expect(page.getByRole("heading", { name: "最终验收" })).toBeVisible();
    await expect(page.getByText("项目状态 · 最终验收")).toBeVisible();

    await builderPage.goto(workspacePath);
    await expect(builderPage.getByText("项目状态 · 最终验收")).toBeVisible();
    await expect(builderPage.getByRole("button", { name: "确认最终验收并完成项目" })).toHaveCount(0);
    await page.getByRole("button", { name: "确认最终验收并完成项目" }).click();
    await expect(page.getByText("项目状态 · 已完成")).toBeVisible();
    await expect(page.getByText("项目已完成；全部提交与验收历史仍可查看。")).toBeVisible();

    await builderPage.reload();
    await expect(builderPage.getByText("项目状态 · 已完成")).toBeVisible();
    await expect(builderPage.getByText("项目已完成；全部提交与验收历史仍可查看。")).toBeVisible();
    await expectNoHorizontalOverflow(builderPage);
    await builderPage.screenshot({
      path: "artifacts/ui-parity/s3/s3-workspace-completed-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await expect(builderPage.getByLabel("本轮交付说明")).toHaveCount(0);

    // Capture a real App Router Flight payload after the project is completed.
    builderPage.route(`**${workspacePath}*`, async (route) => {
      if (route.request().headers()["next-router-prefetch"] === "1") {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await builderPage.goto("/builder/applications");
    const workspaceLink = builderPage.getByRole("link", { name: "进入 Workspace →" });
    await expect(workspaceLink).toBeVisible();
    const flightRequestPromise = builderPage.waitForRequest((request) => {
      const headers = request.headers();
      return new URL(request.url()).pathname === workspacePath &&
        headers.rsc === "1" &&
        headers["next-router-prefetch"] !== "1";
    });
    const [, flightRequest] = await Promise.all([workspaceLink.click(), flightRequestPromise]);
    expect(flightRequest.resourceType()).toBe("fetch");
    expect(flightRequest.isNavigationRequest()).toBe(false);
    const requestHeaders = flightRequest.headers();
    const replayHeaders = Object.fromEntries(
      ["accept", "next-router-state-tree", "next-url", "rsc"].flatMap((name) =>
        requestHeaders[name] ? [[name, requestHeaders[name]]] : [],
      ),
    );
    const flightReplay = await builderPage.context().request.get(flightRequest.url(), { headers: replayHeaders });
    expect(flightReplay.status()).toBe(200);
    expect(flightReplay.headers()["content-type"]).toContain("text/x-component");
    flightBodies.push(await flightReplay.text());
    await expect(builderPage).toHaveURL(new RegExp(`${workspacePath.replaceAll("/", "\\/")}$`));
    await expect(builderPage.getByText("项目状态 · 已完成")).toBeVisible();
    for (const secret of [enterpriseRequirement, privateInterview, ...privateIds]) {
      expect(flightBodies.join("\n")).not.toContain(secret);
    }

    await page.goto(`${projectPath}/applications`);
    await expect(page.getByRole("link", { name: "进入 Workspace →" })).toBeVisible();
    await page.goto(projectPath);
    await expect(page.getByRole("link", { name: "查看交付历史" })).toBeVisible();
    await page.getByRole("link", { name: "查看交付历史" }).click();
    await expect(page.getByText("项目状态 · 已完成")).toBeVisible();
  } finally {
    await builderContext.close();
  }
});
