import { randomUUID } from "node:crypto";
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
import { validSpecDocument } from "../helpers/spec-fixture";

const { tools, app } = loadLocalEnv(resolve(process.cwd()));
if (!tools.DEMO_USER_PASSWORD || !tools.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Run db:prepare before the Spec review regression tests.");
}
const password = tools.DEMO_USER_PASSWORD;
const authAdmin = createClient(
  requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  tools.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const admin = postgres(
  requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"),
  { max: 1, prepare: false },
);
const email = `spec-review-${randomUUID()}@qianzo.test`;
let userId: string;
let projectId: string;

test.beforeAll(async () => {
  const { data, error } = await authAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  await admin`insert into app.users (id, display_name) values (${userId}, 'Spec 评审测试企业')`;
  await admin`insert into app.user_roles (user_id, role) values (${userId}, 'ENTERPRISE')`;
});

test.beforeEach(async () => {
  await clearDemoBusinessData(admin, [userId]);
  projectId = randomUUID();
  const specId = randomUUID();
  // Only establish the starting state. Each regression drives the actual UI
  // and Server Actions; cleanup is restricted to this suite's synthetic owner.
  await admin.begin(async (transaction) => {
    await transaction`
      insert into app.projects
        (id, owner_id, title, original_requirement, budget_min_minor, budget_max_minor, currency)
      values (${projectId}, ${userId}, 'Spec 评审回归项目', '核对草稿放弃与锁定确认。', 100000, 250050, 'CNY')
    `;
    await transaction`
      insert into app.spec_versions (id, project_id, version_no, schema_version, content, created_by)
      values (${specId}, ${projectId}, 1, 1, ${transaction.json(validSpecDocument())}, ${userId})
    `;
    await transaction`
      update app.projects set current_spec_version_id = ${specId}, version = version + 1
      where id = ${projectId}
    `;
  });
});

test.afterAll(async () => {
  try {
    if (userId) {
      await clearDemoBusinessData(admin, [userId]);
      await admin`delete from app.user_roles where user_id = ${userId}`;
      await admin`delete from app.users where id = ${userId}`;
      const { error } = await authAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  } finally {
    await admin.end();
  }
});

test("a recovered draft stays on cancel and is cleared on confirmed conflict discard", async ({ page }) => {
  let discard = false;
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload" || discard) await dialog.accept();
    else await dialog.dismiss();
  });
  await loginDemoUser(page, email, password);
  const projectPath = `/enterprise/projects/${projectId}`;
  await page.goto(`${projectPath}/spec`);
  await page.getByRole("tab", { name: "编辑 Spec" }).click();
  const editor = page.getByTestId("structured-spec-editor");
  const draftKey = `qianzo:spec-draft:${projectId}`;
  const draft = () => page.evaluate((key) => sessionStorage.getItem(key), draftKey);
  await editor.getByLabel("项目目标").fill("应该在明确放弃后消失的草稿目标。");
  await expect.poll(draft).not.toBeNull();

  await page.reload();
  await page.getByRole("tab", { name: "编辑 Spec" }).click();
  await expect(editor.getByLabel("项目目标")).toHaveValue("应该在明确放弃后消失的草稿目标。");

  const otherTab = await page.context().newPage();
  await otherTab.goto(projectPath);
  await otherTab.getByText("编辑参考预算", { exact: true }).click();
  await otherTab.getByLabel("参考预算上限（CNY）").fill("3000");
  await otherTab.getByRole("button", { name: "保存参考预算" }).click();
  await expect(otherTab.getByText(/参考预算已保存：/)).toBeVisible();
  await otherTab.close();
  await editor.getByRole("button", { name: "保存为新版本" }).click();
  await expect(editor.locator('[data-error-code="VERSION_CONFLICT"]')).toBeVisible();
  const abandon = editor.getByRole("button", { name: "放弃修改并重新加载" });
  await abandon.click();
  await expect(editor.getByLabel("项目目标")).toHaveValue("应该在明确放弃后消失的草稿目标。");
  await expect.poll(draft).not.toBeNull();

  discard = true;
  await abandon.click();
  await page.getByRole("tab", { name: "编辑 Spec" }).click();
  await expect.poll(draft).toBeNull();
  await expect(editor.getByLabel("项目目标")).toHaveValue(validSpecDocument().projectGoal);
  await expect(editor.locator('[data-error-code="VERSION_CONFLICT"]')).toHaveCount(0);
});

test("adopting a candidate requires a fresh confirmation before the new Spec can lock", async ({ page }) => {
  await loginDemoUser(page, email, password);
  await page.goto(`/enterprise/projects/${projectId}/spec`);
  await page.getByLabel("访谈回复").fill("请将现有范围整理成新的候选版本，保留里程碑和验收要求。");
  await page.getByRole("button", { name: "生成候选 Spec" }).click();
  await expect(page.getByText("候选 Spec 已生成，可在下方预览。")).toBeVisible();
  await page.getByRole("tab", { name: "访谈候选" }).click();
  const scope = page.locator(".spec-lock-scope");
  await scope.getByRole("checkbox", { name: /Spec v1/ }).check();
  await expect(scope.getByRole("button", { name: "确认锁定当前版本" })).toBeEnabled();

  await page.getByRole("button", { name: "采用为当前 Spec 版本" }).click();
  await expect(page.getByText("该候选已采用为版本 2，历史版本不会被覆盖。")).toBeVisible();
  const confirmation = scope.getByRole("checkbox", { name: /Spec v2/ });
  await expect(confirmation).not.toBeChecked();
  await expect(scope.getByRole("button", { name: "确认锁定当前版本" })).toBeDisabled();
  const [before] = await admin`select locked_spec_version_id from app.projects where id = ${projectId}`;
  expect(before.locked_spec_version_id).toBeNull();
  await confirmation.check();
  await scope.getByRole("button", { name: "确认锁定当前版本" }).click();
  await expect(scope.getByText(/已锁定 Spec 版本 2/)).toBeVisible();
  const [after] = await admin`
    select locked_spec_version_id = current_spec_version_id as locked_current
    from app.projects where id = ${projectId}
  `;
  expect(after.locked_current).toBe(true);
});
