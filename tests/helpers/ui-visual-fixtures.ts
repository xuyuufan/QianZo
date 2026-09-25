import { randomUUID } from "node:crypto";

import type postgres from "postgres";

const visualExamples = [
  {
    title: "门店预约与排班管理工具",
    goal: "为多家线下门店提供预约、员工排班和到店提醒，减少人工协调时间。",
  },
  {
    title: "合同风险审阅助手",
    goal: "上传常用合同后标记关键条款，并生成可追溯的审阅意见与修改建议。",
  },
  {
    title: "摄影作品集与预约网站",
    goal: "展示摄影作品、套餐与空档日期，让访客在线提交拍摄预约。",
  },
  {
    title: "餐饮后厨备料看板",
    goal: "按营业时段生成备料任务，跟踪缺料、完成情况和每日损耗。",
  },
  {
    title: "邮件线索自动归类",
    goal: "将销售邮箱中的询盘按产品线和优先级归档，并同步负责人。",
  },
  {
    title: "社区团购订单工具",
    goal: "供团长发布商品、居民下单并核销自提，支持按批次汇总订单。",
  },
] as const;

/** Synthetic rows used only for local visual comparison screenshots. */
export async function insertVisualDrafts(
  sql: ReturnType<typeof postgres>,
  ownerId: string,
  count = visualExamples.length,
) {
  const ids: string[] = [];
  await sql.begin(async (transaction) => {
    for (const example of visualExamples.slice(0, count)) {
      const id = randomUUID();
      ids.push(id);
      await transaction`
        insert into app.projects (id, owner_id, title, original_requirement)
        values (${id}, ${ownerId}, ${example.title}, ${example.goal})
      `;
    }
  });
  return ids;
}

/** Adds valid published whitelist snapshots for local E2E layout captures. */
export async function insertVisualOpenProjects(
  sql: ReturnType<typeof postgres>,
  ownerId: string,
  count = visualExamples.length,
) {
  const ids: string[] = [];
  await sql.begin(async (transaction) => {
    for (const [index, example] of visualExamples.slice(0, count).entries()) {
      const projectId = randomUUID();
      const versionId = randomUUID();
      const document = {
        schemaVersion: 1,
        projectGoal: example.goal,
        background: "本地视觉对照用的合成项目内容。",
        userRoles: [{ id: "role-requester", name: "项目负责人", description: "维护项目需求并查看交付内容。" }],
        features: [{ id: "feature-core", title: "核心工作流", description: example.goal, userRoleIds: ["role-requester"] }],
        pages: [],
        userFlows: [],
        integrations: [],
        technicalConstraints: [],
        deliverables: [{ id: "deliverable-app", title: "可运行的应用", description: "提供与项目目标一致的可运行应用。" }],
        milestones: [{
          id: "milestone-first",
          title: "首个可验收版本",
          description: "交付核心工作流与对应说明。",
          dueAfterDays: 14 + index,
          deliverableIds: ["deliverable-app"],
          acceptanceCriteria: [{
            id: "criterion-workflow",
            description: "核心工作流可以按需求完成并保存结果。",
            verificationMethod: "按验收场景逐项操作并核对持久化结果。",
          }],
        }],
        outOfScope: [],
        assumptions: [],
      };
      const snapshot = {
        schemaVersion: 1,
        lockedSpecVersionId: versionId,
        title: example.title,
        budget: { minMinor: 1000000, maxMinor: 2500000, currency: "CNY" },
        document,
      };

      await transaction`
        insert into app.projects (id, owner_id, title, original_requirement)
        values (${projectId}, ${ownerId}, ${example.title}, ${example.goal})
      `;
      await transaction`
        insert into app.spec_versions (id, project_id, version_no, schema_version, content, created_by)
        values (${versionId}, ${projectId}, 1, 1, ${transaction.json(document)}, ${ownerId})
      `;
      await transaction`
        update app.projects
        set current_spec_version_id = ${versionId},
            budget_min_minor = 1000000,
            budget_max_minor = 2500000,
            currency = 'CNY',
            locked_spec_version_id = ${versionId},
            locked_at = now(),
            status = 'OPEN',
            published_spec_snapshot = ${transaction.json(snapshot)},
            published_at = now()
        where id = ${projectId}
      `;
      ids.push(projectId);
    }
  });
  return ids;
}
