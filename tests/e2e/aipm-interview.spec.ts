import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { clearDemoBusinessData } from "../helpers/demo-data";
import { loginDemoUser } from "../helpers/demo-login";
import { insertVisualOpenProjects } from "../helpers/ui-visual-fixtures";
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
let enterpriseAUserId: string;
const builderOnlyEmail = `spec-builder-${Date.now()}@qianzo.test`;
let builderOnlyUserId: string;

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
  enterpriseAUserId = data.users.find((user) => user.email === "enterprise-a@qianzo.local")!.id;
  await clearDemoBusinessData(adminSql, demoUserIds);
  const { data: builderUser, error: createError } = await authAdmin.auth.admin.createUser({
    email: builderOnlyEmail,
    password: tools.DEMO_USER_PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;
  builderOnlyUserId = builderUser.user.id;
  await adminSql`insert into app.users (id, display_name) values (${builderOnlyUserId}, 'Spec 测试 Builder')`;
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

test("a draft becomes a published recruitment project end to end", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const password = tools.DEMO_USER_PASSWORD;

  await loginDemoUser(page, "enterprise-a@qianzo.local", password);
  await page.getByRole("link", { name: "开始需求" }).click();
  await page.getByLabel("项目标题").fill("E2E 访谈项目");
  await page.getByLabel("原始需求").fill("ZZSECRET-原始需求：需要把访谈整理成可招募的确认范围。");
  await page.getByRole("button", { name: "创建草稿" }).click();
  await expect(page).toHaveURL(/\/enterprise\/projects\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const projectPath = new URL(page.url()).pathname;
  const projectId = projectPath.split("/").pop() ?? "";

  await page.getByRole("link", { name: "需求访谈与 Spec" }).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath.replaceAll("/", "\\/")}/spec$`));

  // Inspect the desktop two-column workbench before exercising its mobile stack.
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopInterviewColumn = await page.locator(".spec-interview-column").boundingBox();
  const desktopEditorColumn = await page.locator(".spec-editor-column").boundingBox();
  expect(desktopInterviewColumn).not.toBeNull();
  expect(desktopEditorColumn).not.toBeNull();
  expect(desktopEditorColumn!.x).toBeGreaterThan(desktopInterviewColumn!.x);
  expect(Math.abs(desktopEditorColumn!.y - desktopInterviewColumn!.y)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("spec-workbench-desktop.png") });

  // Keep the full S0/S1 workflow on a phone-sized viewport through the Spec
  // editor and recruitment pages so the responsive stack is exercised too.
  await page.setViewportSize({ width: 390, height: 844 });
  const interviewColumn = await page.locator(".spec-interview-column").boundingBox();
  const editorColumn = await page.locator(".spec-editor-column").boundingBox();
  expect(interviewColumn).not.toBeNull();
  expect(editorColumn).not.toBeNull();
  expect(editorColumn!.y).toBeGreaterThan(interviewColumn!.y);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("spec-workbench-mobile.png") });

  await page
    .getByLabel("访谈回复")
    .fill("ZZSECRET-访谈：我们希望把模糊需求整理成可招募的确认范围，并按里程碑逐条验收。");
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
  await expect(page.getByRole("heading", { name: "里程碑与验收" })).toBeVisible();
  await expect(page.getByText("第 14 个自然日")).toBeVisible();

  // A new candidate must not overwrite a manual edit already in progress.
  const editor = page.getByTestId("structured-spec-editor");
  await expect(editor.locator(".spec-editor-section")).toHaveCount(11);
  await editor.getByLabel("项目目标").fill("保留的未保存目标：先确认访谈内容，再确认交付范围。");
  await page
    .getByLabel("访谈回复")
    .fill("请明确企业负责人和交付方的职责，并按里程碑逐项验证验收标准。");
  await page.getByRole("button", { name: "生成候选 Spec" }).click();
  await expect(page.locator('li[data-role="USER"]')).toHaveCount(3);
  await expect(page.locator('li[data-role="ASSISTANT"]')).toHaveCount(3);
  await expect(page.getByText("候选 Spec 已生成，可在下方预览。")).toBeVisible();
  await expect(editor.getByLabel("项目目标")).toHaveValue(
    "保留的未保存目标：先确认访谈内容，再确认交付范围。",
  );
  await expect(editor.locator(".editor-save-state")).toContainText("有未保存修改");
  const secondCandidateGoal = await page
    .locator(".spec-candidate-panel .spec-section")
    .filter({ has: page.getByRole("heading", { name: "项目目标" }) })
    .locator("p")
    .first()
    .innerText();

  // Adopt the candidate into the first immutable version.
  const [databaseProject] = await adminSql`select version from app.projects where id = ${projectId}`;
  const adoptionVersion = page.locator(
    '.spec-candidate-panel form input[name="expectedVersion"]',
  );
  await expect(adoptionVersion).toHaveValue(String(databaseProject.version));
  await page.getByRole("button", { name: "采用为当前 Spec 版本" }).click();
  await expect(page.getByText("该候选已采用为版本 1，历史版本不会被覆盖。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spec 版本 1（当前）" })).toBeVisible();
  await expect(page.getByText("当前 Spec 版本 1")).toBeVisible();

  // A manual save always appends: the earlier version stays readable.
  await expect(editor.getByLabel("项目目标")).toHaveValue(
    "保留的未保存目标：先确认访谈内容，再确认交付范围。",
  );

  // New IDs remain stable as rows move or fields change. Linked entries must
  // first be unlinked before they can be removed.
  await editor.getByRole("button", { name: "＋ 添加功能" }).click();
  const featureCards = editor.locator("#edit-features .spec-edit-card");
  const newFeatureCard = featureCards.last();
  const newFeatureId = (await newFeatureCard.locator("code").innerText()).trim();
  await newFeatureCard.getByLabel("功能名称").fill("E2E 引用校验功能");
  await newFeatureCard.getByRole("button", { name: `上移 ${newFeatureId}` }).click();
  await expect(featureCards.first().locator("code")).toHaveText(newFeatureId);

  await editor.getByRole("button", { name: "＋ 添加页面" }).click();
  const pageCard = editor.locator("#edit-pages .spec-edit-card").last();
  const featureChoice = pageCard.getByRole("checkbox", {
    name: `E2E 引用校验功能 · ${newFeatureId}`,
  });
  await featureChoice.check();
  const deleteFeature = editor.getByRole("button", { name: `删除 ${newFeatureId}` });
  await expect(deleteFeature).toBeDisabled();
  await featureChoice.uncheck();
  await expect(deleteFeature).toBeEnabled();
  await deleteFeature.click();
  const pageId = (await pageCard.locator("code").innerText()).trim();
  await editor.getByRole("button", { name: `删除 ${pageId}` }).click();

  // The shared cumulative-day validator reports the specific milestone field.
  await editor.getByRole("button", { name: "＋ 添加里程碑" }).click();
  const milestoneCards = editor.locator("#edit-milestones .milestone-edit-card");
  const newMilestone = milestoneCards.last();
  const milestoneId = (await newMilestone.locator("code").first().innerText()).trim();
  const previousDays = Number(
    await milestoneCards
      .nth((await milestoneCards.count()) - 2)
      .getByRole("spinbutton")
      .inputValue(),
  );
  const newMilestoneDays = newMilestone.getByRole("spinbutton");
  await newMilestoneDays.fill(String(previousDays));
  await expect(newMilestoneDays).toHaveAttribute("aria-invalid", "true");
  await expect(newMilestone.getByText(/严格递增/)).toBeVisible();
  await expect(editor.getByRole("button", { name: "保存为新版本" })).toBeDisabled();
  await newMilestoneDays.fill(String(previousDays + 1));
  await expect(newMilestoneDays).toHaveAttribute("aria-invalid", "false");
  await editor.getByRole("button", { name: `删除 ${milestoneId}` }).click();

  await expect(editor.getByLabel("验收标准").first()).toBeVisible();
  await editor
    .getByLabel("验证方法")
    .first()
    .fill("E2E：逐条核对现场操作结果与验收清单。");
  const expectedCriteria = await Promise.all(
    (await editor.locator(".spec-criterion-card").all()).map(async (criterion) => ({
      description: await criterion.getByLabel("验收标准").inputValue(),
      verificationMethod: await criterion.getByLabel("验证方法").inputValue(),
    })),
  );
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Spec 还有未保存修改");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "← 返回项目总览" }).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath.replaceAll("/", "\\/")}/spec$`));
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
  await expect(reviewedVersion.getByText("保留的未保存目标：")).toHaveCount(0);
  await expect(reviewedVersion.getByText(secondCandidateGoal)).toHaveCount(1);

  // Reference budget lives on the project overview and is saved exactly.
  await page.getByRole("link", { name: "← 返回项目总览" }).click();
  await expect(page.getByRole("heading", { name: "E2E 访谈项目" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("project-overview-with-spec-desktop.png"), fullPage: true, animations: "disabled" });
  await page.goto(`${projectPath}?tab=spec`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("navigation", { name: "Spec 文档目录" }).getByRole("link")).toHaveCount(11);
  await expect(page.getByRole("heading", { name: "页面结构" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "用户流程" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "技术约束" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "范围外事项" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "假设" })).toBeVisible();
  await expect(page.getByText(/验证方式：E2E：逐条核对现场操作结果与验收清单。/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("project-spec-read-desktop.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("project-spec-read-tablet.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("project-spec-read-mobile.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${projectPath}?tab=milestones`);
  await expect(page.getByRole("heading", { name: "里程碑计划" })).toBeVisible();
  await expect(page.getByText("验证方法：E2E：逐条核对现场操作结果与验收清单。")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("project-milestones-desktop.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("project-milestones-tablet.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("project-milestones-mobile.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(projectPath);
  await page.getByText("补充参考预算", { exact: true }).click();
  await page.getByLabel("参考预算下限（CNY）").fill("1000");
  await page.getByLabel("参考预算上限（CNY）").fill("2500.50");
  await page.getByRole("button", { name: "保存参考预算" }).click();
  await expect(page.getByText(/参考预算已保存：¥1000\.00 – ¥2500\.50/)).toBeVisible();

  const staleLockedEditor = await page.context().newPage();
  await staleLockedEditor.goto(projectPath);
  await staleLockedEditor.getByText("编辑项目说明", { exact: true }).click();

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
  await expect(page.getByText(/已锁定 Spec 版本：标题、原始需求、参考预算与当前 Spec 已冻结/)).toBeVisible();
  await staleLockedEditor.getByLabel("项目标题").fill("锁定后改名");
  await staleLockedEditor.getByRole("button", { name: "保存草稿" }).click();
  await expect(staleLockedEditor.locator('[data-error-code="SPEC_LOCKED"]')).toContainText("已锁定评审范围");
  await staleLockedEditor.close();

  // Mock enterprise deposit: a fixed demo amount with a simulated success.
  await page.getByRole("link", { name: "Mock 定金与发布" }).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath.replaceAll("/", "\\/")}/publish$`));
  await expect(page.getByRole("heading", { name: "已锁定的范围" })).toBeVisible();
  await page.getByRole("button", { name: "创建企业模拟定金" }).click();
  await expect(page.getByText(/已创建企业模拟定金 ¥1\.00/)).toBeVisible();
  await page.getByRole("button", { name: "模拟支付成功" }).click();
  await expect(page.getByText(/发布仍需你在脱敏预览后手动确认/)).toBeVisible();
  await expect(page.getByText(/付款只满足发布前置条件/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/付款只满足发布前置条件/)).toBeVisible();
  await expect(page.getByRole("button", { name: "模拟支付成功" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "创建企业模拟定金" })).toHaveCount(0);

  // Masked preview: only text may change, then the final preview is confirmed.
  const maskedEditor = page.getByTestId("structured-masked-spec-editor");
  await expect(maskedEditor.locator(".spec-editor-section")).toHaveCount(11);
  await expect(page.getByText("结构与锁定版本一致，可以确认发布。")).toBeVisible();
  const maskedDocumentField = maskedEditor.locator('input[name="maskedDocument"]');
  const lockedDocument = JSON.parse(await maskedDocumentField.inputValue());
  await expect(maskedEditor.locator(".editor-add-button")).toHaveCount(0);
  await expect(maskedEditor.locator(".reference-choices input").first()).toBeDisabled();
  await expect(maskedEditor.getByRole("spinbutton").first()).toBeDisabled();
  const publicGoal = "面向需求与交付协作的项目确认和验收工作台。";
  await maskedEditor.getByLabel("项目目标").fill(publicGoal);
  const editedMaskedDocument = JSON.parse(await maskedDocumentField.inputValue());
  expect(editedMaskedDocument).toEqual({ ...lockedDocument, projectGoal: publicGoal });
  await maskedEditor.getByLabel("招募标题（脱敏后）").fill("E2E 招募项目（脱敏）");
  await expect(page.getByRole("button", { name: "确认并发布招募" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /我已确认这是最终预览/ }).check();
  await page.getByRole("button", { name: "确认并发布招募" }).click();
  // The publish form is replaced by the published state once the intent succeeded.
  await expect(page.getByRole("heading", { name: "已发布" })).toBeVisible();
  await expect(page.getByText(/项目状态为 OPEN，发布于/)).toBeVisible();
  await expect(page.getByRole("button", { name: "确认并发布招募" })).toHaveCount(0);
  await expect(page.getByText("已锁定的范围")).toHaveCount(1);

  // Publishing locks the scope, but the enterprise detail must still report the
  // real status instead of falling back to DRAFT.
  await page.goto(projectPath);
  await expect(page.getByText(/项目版本 \d+/)).toBeVisible();
  await expect(page.getByText("招募中", { exact: true })).toBeVisible();
  await expect(page.getByText("范围已锁定", { exact: true })).toHaveCount(0);

  const privateMessage = "ZZSECRET-访谈：我们希望把模糊需求整理成可招募的确认范围，并按里程碑逐条验收。";
  const privateRequirement = "ZZSECRET-原始需求：需要把访谈整理成可招募的确认范围。";
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
  await loginDemoUser(builderPage, builderOnlyEmail, password);
  await builderPage.goto(specPath);
  await expect(builderPage).toHaveURL(/\/projects$/);

  // The published project shows up in the recruitment view, masked.
  await insertVisualOpenProjects(adminSql, enterpriseAUserId);
  await builderPage.setViewportSize({ width: 1440, height: 900 });
  await builderPage.goto("/projects");
  await expect(builderPage.getByRole("heading", { name: "项目大厅" })).toBeVisible();
  await expect(builderPage.getByText("07 MATCHES")).toBeVisible();
  await expectNoHorizontalOverflow(builderPage);
  const desktopColumns = await builderPage.getByTestId("recruitment-results").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(desktopColumns).toBe(3);
  await expect(builderPage.getByTestId("recruitment-results").getByRole("link")).toHaveCount(7);
  await builderPage.emulateMedia({ reducedMotion: "reduce" });
  await builderPage.evaluate(() => document.fonts.ready);
  await builderPage.screenshot({ path: test.info().outputPath("recruitment-list-desktop.png"), fullPage: true, animations: "disabled" });
  await builderPage.setViewportSize({ width: 768, height: 1024 });
  const tabletColumns = await builderPage.getByTestId("recruitment-results").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(tabletColumns).toBe(2);
  await builderPage.screenshot({ path: test.info().outputPath("recruitment-list-tablet.png"), fullPage: true, animations: "disabled" });
  await builderPage.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(builderPage);
  const mobileColumns = await builderPage.getByTestId("recruitment-results").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(mobileColumns).toBe(1);
  await builderPage.screenshot({ path: test.info().outputPath("recruitment-list-mobile.png"), fullPage: true, animations: "disabled" });
  await expect(builderPage.getByRole("link", { name: /E2E 招募项目（脱敏）/ })).toBeVisible();
  const recruitmentSearch = builderPage.getByLabel("搜索招募项目");
  await recruitmentSearch.fill("需求与交付协作");
  await expect(builderPage.getByRole("link", { name: /E2E 招募项目（脱敏）/ })).toBeVisible();
  await recruitmentSearch.fill("不存在的项目关键词");
  await expect(builderPage.getByText("没有匹配的项目")).toBeVisible();
  await recruitmentSearch.fill("E2E 招募项目");
  await expect(builderPage.getByRole("link", { name: /E2E 招募项目（脱敏）/ })).toBeVisible();
  await recruitmentSearch.fill("");
  const recruitmentResponse = await builderPage.goto(`/projects/${projectId}`);
  const recruitmentBody = (await recruitmentResponse?.text()) ?? "";
  expect(recruitmentBody).not.toContain("ZZSECRET");
  expect(recruitmentBody).not.toContain(privateRequirement);
  expect(recruitmentBody).not.toContain(privateMessage);
  expect(recruitmentBody).not.toContain("qianzo.local");
  await expect(builderPage.getByRole("heading", { name: "E2E 招募项目（脱敏）" })).toBeVisible();
  await expectNoHorizontalOverflow(builderPage);
  await builderPage.screenshot({ path: test.info().outputPath("recruitment-detail-mobile.png") });
  await builderPage.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalOverflow(builderPage);
  await builderPage.screenshot({ path: test.info().outputPath("recruitment-detail-desktop.png") });
  const publishedBudget = builderPage.locator("p").filter({ hasText: "参考预算" });
  await expect(publishedBudget).toContainText("¥1000.00 – ¥2500.50");
  // The cycle comes from the last milestone of the locked document (30 days).
  await expect(publishedBudget).toContainText("30 个自然日");
  await expect(builderPage.getByText(/不是成交价或报价/)).toBeVisible();
  await expect(builderPage.getByText("里程碑与验收")).toBeVisible();
  const publicCriteria = builderPage.locator("[data-testid='recruitment-snapshot'] .spec-milestone li");
  await expect(publicCriteria).toHaveCount(expectedCriteria.length);
  for (const [index, criterion] of expectedCriteria.entries()) {
    await expect(publicCriteria.nth(index)).toContainText(criterion.description);
    await expect(publicCriteria.nth(index)).toContainText(criterion.verificationMethod);
  }
  // A draft of the same enterprise stays invisible to the builder.
  expect(recruitmentBody).not.toContain("未发布");
  await builderContext.close();
});

async function expectNoHorizontalOverflow(page: Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
