import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import { parse } from "dotenv";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeOnboardingWithDatabase,
  type Actor,
} from "@/modules/identity/onboarding";
import {
  createProjectWithDatabase,
  getOwnProjectWithDatabase,
  listOwnProjectsWithDatabase,
  updateProjectDraftWithDatabase,
} from "@/modules/projects/repository";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
let database: Database;
let authAdmin: SupabaseClient;
let enterpriseA: Actor;
let enterpriseB: Actor;
let builder: Actor;
let userIds: string[] = [];

async function ensureAuthUser(email: string, password: string) {
  const { data: page, error: listError } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = page.users.find((user) => user.email === email);
  if (existing) return existing.id;
  const { data, error } = await authAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

beforeAll(async () => {
  const root = resolve(import.meta.dirname, "../..");
  const tools = parse(readFileSync(resolve(root, ".env.tools.local"), "utf8"));
  const app = parse(readFileSync(resolve(root, ".env.local"), "utf8"));
  if (!tools.DEMO_USER_PASSWORD) throw new Error("DEMO_USER_PASSWORD is required.");

  admin = postgres(tools.SUPABASE_DB_ADMIN_URL, { max: 1, prepare: false });
  runtime = postgres(app.DATABASE_URL, { max: 5, prepare: false });
  database = drizzle(runtime, { schema });
  authAdmin = createClient(app.NEXT_PUBLIC_SUPABASE_URL, tools.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  userIds = await Promise.all([
    ensureAuthUser("projects-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("projects-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("projects-builder@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await admin`delete from app.projects where owner_id in ${admin(userIds)}`;
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "项目测试企业 A",
    roles: ["ENTERPRISE"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "项目测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builder = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "项目测试 Builder",
    roles: ["BUILDER"],
  });
});

beforeEach(async () => {
  await admin`delete from app.projects where owner_id in ${admin(userIds)}`;
});

afterAll(async () => {
  if (admin && userIds.length) {
    await admin`delete from app.projects where owner_id in ${admin(userIds)}`;
    await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
    await admin`delete from app.users where id in ${admin(userIds)}`;
    for (const userId of userIds) {
      const { error } = await authAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  }
  await Promise.all([admin?.end(), runtime?.end()]);
});

describe("project draft service boundary", () => {
  it("creates one project for a replayed intent and rejects a conflicting reuse", async () => {
    const projectId = randomUUID();
    const input = { projectId, title: "  第一份草稿  ", originalRequirement: "真实需求" };
    const created = await createProjectWithDatabase(database, enterpriseA, input);
    const replayed = await createProjectWithDatabase(database, enterpriseA, input);

    expect(created).toMatchObject({
      id: projectId,
      ownerId: enterpriseA.id,
      title: "第一份草稿",
      originalRequirement: "真实需求",
      version: 1,
      status: "DRAFT",
    });
    expect(replayed.id).toBe(created.id);
    expect(await listOwnProjectsWithDatabase(database, enterpriseA)).toHaveLength(1);

    await expect(
      createProjectWithDatabase(database, enterpriseA, {
        ...input,
        title: "冲突内容",
      }),
    ).rejects.toMatchObject({ code: "CREATE_CONFLICT" });
  });

  it("hides another enterprise project for list, read, and update", async () => {
    const projectId = randomUUID();
    await createProjectWithDatabase(database, enterpriseA, {
      projectId,
      title: "企业 A 私有项目",
      originalRequirement: "不可跨企业读取",
    });

    expect(await listOwnProjectsWithDatabase(database, enterpriseB)).toEqual([]);
    expect(await getOwnProjectWithDatabase(database, enterpriseB, projectId)).toBeNull();
    await expect(
      updateProjectDraftWithDatabase(database, enterpriseB, {
        projectId,
        expectedVersion: 1,
        title: "越权修改",
        originalRequirement: "不应成功",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await getOwnProjectWithDatabase(database, enterpriseA, projectId)).toMatchObject({
      title: "企业 A 私有项目",
      version: 1,
    });
  });

  it("rejects a Builder and unapproved request fields", async () => {
    const projectId = randomUUID();
    await expect(
      createProjectWithDatabase(database, builder, {
        projectId,
        title: "Builder 伪造项目",
        originalRequirement: "",
      }),
    ).rejects.toMatchObject({ code: "ROLE_REQUIRED" });

    await expect(
      createProjectWithDatabase(database, enterpriseA, {
        projectId,
        title: "含伪造字段",
        originalRequirement: "",
        ownerId: enterpriseB.id,
        status: "OPEN",
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("increments the version and preserves the first concurrent update", async () => {
    const projectId = randomUUID();
    await createProjectWithDatabase(database, enterpriseA, {
      projectId,
      title: "并发编辑",
      originalRequirement: "初始版本",
    });

    const attempts = await Promise.allSettled([
      updateProjectDraftWithDatabase(database, enterpriseA, {
        projectId,
        expectedVersion: 1,
        title: "编辑窗口一",
        originalRequirement: "第一个合法保存",
      }),
      updateProjectDraftWithDatabase(database, enterpriseA, {
        projectId,
        expectedVersion: 1,
        title: "编辑窗口二",
        originalRequirement: "第二个陈旧保存",
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    expect(await getOwnProjectWithDatabase(database, enterpriseA, projectId)).toMatchObject({
      version: 2,
    });
  });

  it("returns a conflict when a create replay reaches an edited project", async () => {
    const input = {
      projectId: randomUUID(),
      title: "会被编辑",
      originalRequirement: "创建时内容",
    };
    await createProjectWithDatabase(database, enterpriseA, input);
    await updateProjectDraftWithDatabase(database, enterpriseA, {
      ...input,
      expectedVersion: 1,
      title: "已编辑",
    });

    await expect(createProjectWithDatabase(database, enterpriseA, input)).rejects.toMatchObject({
      code: "CREATE_CONFLICT",
    });
  });

  it("enforces title and requirement constraints in both validation and PostgreSQL", async () => {
    await expect(
      createProjectWithDatabase(database, enterpriseA, {
        projectId: randomUUID(),
        title: " ",
        originalRequirement: "",
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      createProjectWithDatabase(database, enterpriseA, {
        projectId: randomUUID(),
        title: "超长需求",
        originalRequirement: "x".repeat(10_001),
      }),
    ).rejects.toMatchObject({ name: "ZodError" });

    await expect(
      runtime`
        insert into app.projects (id, owner_id, title, original_requirement)
        values (${randomUUID()}, ${enterpriseA.id}, '', '')
      `,
    ).rejects.toMatchObject({ severity: "ERROR" });
    await expect(
      runtime`
        insert into app.projects (id, owner_id, title, original_requirement)
        values (${randomUUID()}, ${enterpriseA.id}, '数据库长度测试', ${"x".repeat(10_001)})
      `,
    ).rejects.toMatchObject({ severity: "ERROR" });
  });
});
