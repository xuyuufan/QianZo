import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  applyToProjectWithDatabase,
  listOwnApplicationsWithDatabase,
  listProjectApplicationsWithDatabase,
  selectApplicationWithDatabase,
} from "@/modules/applications/repository";
import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import { publishProjectWithDatabase } from "@/modules/projects/publish";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";

import { clearDemoBusinessData } from "../helpers/demo-data";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { createDepositPaidProject, createProjectWithBudgetAndSpec } from "../helpers/project-fixture";
import { validSpecDocument } from "../helpers/spec-fixture";

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
let database: Database;
let authAdmin: SupabaseClient;
let enterpriseA: Actor;
let enterpriseB: Actor;
let builderA: Actor;
let builderB: Actor;
let builderC: Actor;
let userIds: string[] = [];

async function ensureAuthUser(email: string, password: string) {
  const { data: page, error: listError } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = page.users.find((user) => user.email === email);
  if (existing) return existing.id;
  const { data, error } = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function createPublishedProject(owner: Actor, title: string) {
  const { fixture, projectVersion } = await createDepositPaidProject(database, owner, {
    title: `PRIVATE-${title}`,
    originalRequirement: `PRIVATE requirement for ${title}`,
  });
  const project = await publishProjectWithDatabase(database, owner, {
    projectId: fixture.project.id,
    expectedVersion: projectVersion,
    lockedSpecVersionId: fixture.specVersion.id,
    maskedTitle: title,
    maskedDocument: validSpecDocument(),
    confirmed: "on",
  });
  return { project, specVersionId: fixture.specVersion.id };
}

function apply(actor: Actor, projectId: string, statement = "I can deliver the requested scope.") {
  return applyToProjectWithDatabase(database, actor, { projectId, statement });
}

beforeAll(async () => {
  const { tools, app } = loadLocalEnv(resolve(import.meta.dirname, "../.."));
  if (!tools.DEMO_USER_PASSWORD) throw new Error("DEMO_USER_PASSWORD is required.");

  admin = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
    max: 1,
    prepare: false,
  });
  runtime = postgres(requireLoopbackDatabaseUrl(app.DATABASE_URL, "DATABASE_URL"), {
    max: 5,
    prepare: false,
  });
  database = drizzle(runtime, { schema });
  authAdmin = createClient(
    requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    tools.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  userIds = await Promise.all([
    ensureAuthUser("application-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("application-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("application-builder-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("application-builder-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("application-builder-c@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await clearDemoBusinessData(admin, userIds);
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "申请测试企业 A",
    roles: ["ENTERPRISE", "BUILDER"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "申请测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builderA = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "申请测试 Builder A",
    roles: ["BUILDER"],
  });
  builderB = await completeOnboardingWithDatabase(database, userIds[3], {
    displayName: "申请测试 Builder B",
    roles: ["BUILDER"],
  });
  builderC = await completeOnboardingWithDatabase(database, userIds[4], {
    displayName: "申请测试 Builder C",
    roles: ["BUILDER"],
  });
});

beforeEach(async () => {
  await clearDemoBusinessData(admin, userIds);
});

afterAll(async () => {
  if (admin && userIds.length) {
    await clearDemoBusinessData(admin, userIds);
    await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
    await admin`delete from app.users where id in ${admin(userIds)}`;
    for (const userId of userIds) {
      const { error } = await authAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  }
  await Promise.all([admin?.end(), runtime?.end()]);
});

describe("Builder applications and enterprise selection", () => {
  it("creates an actor-bound application and returns only scoped DTOs", async () => {
    const { project, specVersionId } = await createPublishedProject(enterpriseA, "公开申请项目");
    const created = await apply(builderA, project.id, "  I can deliver this scope.  ");
    expect(created.created).toBe(true);
    expect(await apply(builderA, project.id, "I can deliver this scope.")).toEqual({
      applicationId: created.applicationId,
      created: false,
    });
    await expect(apply(builderA, project.id, "A different statement.")).rejects.toMatchObject({
      name: "ApplicationError",
      code: "ALREADY_APPLIED",
    });

    const [stored] = await admin<
      { project_id: string; builder_id: string; spec_version_id: string; statement: string; status: string }[]
    >`
      select project_id, builder_id, spec_version_id, statement, status
      from app.applications where id = ${created.applicationId}
    `;
    expect(stored).toEqual({
      project_id: project.id,
      builder_id: builderA.id,
      spec_version_id: specVersionId,
      statement: "I can deliver this scope.",
      status: "SUBMITTED",
    });

    const own = await listOwnApplicationsWithDatabase(database, builderA);
    expect(own).toHaveLength(1);
    expect(Object.keys(own[0]).sort()).toEqual([
      "applicationId",
      "applicationStatus",
      "appliedAt",
      "projectId",
      "projectStatus",
      "statement",
      "title",
    ]);
    expect(own[0]).toMatchObject({
      applicationId: created.applicationId,
      projectId: project.id,
      title: "公开申请项目",
      statement: "I can deliver this scope.",
      applicationStatus: "SUBMITTED",
      projectStatus: "OPEN",
    });

    const enterpriseList = await listProjectApplicationsWithDatabase(database, enterpriseA, project.id);
    expect(enterpriseList.applications).toHaveLength(1);
    expect(Object.keys(enterpriseList.applications[0]).sort()).toEqual([
      "createdAt",
      "displayName",
      "id",
      "statement",
      "status",
    ]);
    expect(enterpriseList.applications[0]).toMatchObject({
      id: created.applicationId,
      displayName: builderA.displayName,
      statement: "I can deliver this scope.",
      status: "SUBMITTED",
    });
    await expect(listProjectApplicationsWithDatabase(database, enterpriseB, project.id)).rejects.toMatchObject({
      name: "ApplicationError",
      code: "NOT_FOUND",
    });
    expect(await listOwnApplicationsWithDatabase(database, builderB)).toEqual([]);

    const serialized = JSON.stringify({ own, enterpriseList });
    for (const privateMarker of ["PRIVATE-", "PRIVATE requirement", "originalRequirement", "rawSpec", "builderId", "@qianzo.test"]) {
      expect(serialized).not.toContain(privateMarker);
    }
  }, 30000);

  it("rejects wrong roles, disabled Builders, self-applications and unpublished projects", async () => {
    const { project } = await createPublishedProject(enterpriseA, "权限边界项目");
    await expect(apply(enterpriseB, project.id)).rejects.toMatchObject({
      name: "IdentityError",
      code: "ROLE_REQUIRED",
    });
    await expect(apply({ ...builderB, status: "DISABLED" }, project.id)).rejects.toMatchObject({
      name: "IdentityError",
      code: "ACTOR_DISABLED",
    });
    await expect(apply(enterpriseA, project.id)).rejects.toMatchObject({
      name: "ApplicationError",
      code: "CANNOT_APPLY_TO_OWN_PROJECT",
    });
    await expect(apply(builderA, project.id, "   ")).rejects.toMatchObject({ name: "ZodError" });
    await expect(apply(builderA, project.id, "x".repeat(2001))).rejects.toMatchObject({ name: "ZodError" });

    const unpublished = await createProjectWithBudgetAndSpec(database, enterpriseA);
    await expect(apply(builderA, unpublished.project.id)).rejects.toMatchObject({
      name: "ApplicationError",
      code: "NOT_FOUND",
    });
  }, 30000);

  it("serializes concurrent duplicate submissions and enforces project and Spec constraints", async () => {
    const first = await createPublishedProject(enterpriseA, "并发申请项目");
    const attempts = await Promise.allSettled([
      apply(builderA, first.project.id),
      apply(builderA, first.project.id),
    ]);
    expect(attempts.every((result) => result.status === "fulfilled")).toBe(true);
    const applicationIds = attempts.map((result) =>
      result.status === "fulfilled" ? result.value.applicationId : "",
    );
    expect(new Set(applicationIds).size).toBe(1);
    const [count] = await admin<{ count: string }[]>`
      select count(*)::text as count from app.applications where project_id = ${first.project.id}
    `;
    expect(count.count).toBe("1");

    await expect(runtime`
      insert into app.applications (id, project_id, builder_id, statement, spec_version_id)
      values (${randomUUID()}, ${first.project.id}, ${builderA.id}, 'duplicate', ${first.specVersionId})
    `).rejects.toMatchObject({ code: "23505", constraint_name: "applications_project_builder_unique" });

    const second = await createPublishedProject(enterpriseB, "另一项目 Spec");
    await expect(admin`
      insert into app.applications (id, project_id, builder_id, statement, spec_version_id)
      values (${randomUUID()}, ${first.project.id}, ${builderB.id}, 'wrong project Spec', ${second.specVersionId})
    `).rejects.toMatchObject({ code: "23503", constraint_name: "applications_spec_version_fk" });
  }, 30000);

  it("selects one owned applicant with version checks and retains the other submission", async () => {
    const { project } = await createPublishedProject(enterpriseA, "选择并发项目");
    const applicationA = await apply(builderA, project.id, "Builder A statement.");
    const applicationB = await apply(builderB, project.id, "Builder B statement.");
    const otherProject = await createPublishedProject(enterpriseB, "其他企业项目");
    const otherApplication = await apply(builderC, otherProject.project.id, "Other project statement.");

    await expect(selectApplicationWithDatabase(database, enterpriseB, {
      projectId: project.id,
      applicationId: applicationA.applicationId,
      expectedVersion: project.version,
    })).rejects.toMatchObject({ name: "ApplicationError", code: "NOT_FOUND" });
    await expect(selectApplicationWithDatabase(database, enterpriseA, {
      projectId: project.id,
      applicationId: otherApplication.applicationId,
      expectedVersion: project.version,
    })).rejects.toMatchObject({ name: "ApplicationError", code: "NOT_FOUND" });

    const results = await Promise.allSettled([
      selectApplicationWithDatabase(database, enterpriseA, {
        projectId: project.id,
        applicationId: applicationA.applicationId,
        expectedVersion: project.version,
      }),
      selectApplicationWithDatabase(database, enterpriseA, {
        projectId: project.id,
        applicationId: applicationB.applicationId,
        expectedVersion: project.version,
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (fulfilled[0].status !== "fulfilled" || rejected[0].status !== "rejected") {
      throw new Error("Expected exactly one selection to succeed.");
    }
    const selectedId = fulfilled[0].value.applicationId;
    const remainingId = selectedId === applicationA.applicationId
      ? applicationB.applicationId
      : applicationA.applicationId;
    expect(rejected[0].reason).toMatchObject({ name: "ApplicationError", code: "VERSION_CONFLICT" });

    const [storedProject] = await admin<
      { status: string; selected_application_id: string | null; version: number }[]
    >`
      select status, selected_application_id, version from app.projects where id = ${project.id}
    `;
    expect(storedProject).toEqual({
      status: "AWAITING_BUILDER",
      selected_application_id: selectedId,
      version: project.version + 1,
    });
    const [selected] = await admin<{ status: string }[]>`select status from app.applications where id = ${selectedId}`;
    const [remaining] = await admin<{ status: string }[]>`select status from app.applications where id = ${remainingId}`;
    expect(selected.status).toBe("SELECTED");
    expect(remaining.status).toBe("SUBMITTED");

    const selectedBuilder = selectedId === applicationA.applicationId ? builderA : builderB;
    const remainingBuilder = selectedId === applicationA.applicationId ? builderB : builderA;
    const selectedBuilderRows = await listOwnApplicationsWithDatabase(database, selectedBuilder);
    expect(selectedBuilderRows).toHaveLength(1);
    expect(selectedBuilderRows[0]).toMatchObject({
      applicationStatus: "SELECTED",
      projectStatus: "AWAITING_BUILDER",
    });
    const remainingBuilderRows = await listOwnApplicationsWithDatabase(database, remainingBuilder);
    expect(remainingBuilderRows).toHaveLength(1);
    expect(remainingBuilderRows[0]).toMatchObject({
      applicationStatus: "SUBMITTED",
      statement: selectedBuilder === builderA ? "Builder B statement." : "Builder A statement.",
    });
    expect(remainingBuilderRows[0].statement).not.toBe(selectedBuilderRows[0].statement);

    await expect(apply(builderC, project.id, "Late application." )).rejects.toMatchObject({
      name: "ApplicationError",
      code: "INVALID_STAGE",
    });
    const [applicationsAfterLateAttempt] = await admin<{ count: string }[]>`
      select count(*)::text as count from app.applications where project_id = ${project.id}
    `;
    expect(applicationsAfterLateAttempt.count).toBe("2");

    expect(await selectApplicationWithDatabase(database, enterpriseA, {
      projectId: project.id,
      applicationId: selectedId,
      expectedVersion: project.version,
    })).toEqual({ applicationId: selectedId, version: project.version + 1, alreadySelected: true });
    await expect(selectApplicationWithDatabase(database, enterpriseA, {
      projectId: project.id,
      applicationId: remainingId,
      expectedVersion: project.version,
    })).rejects.toMatchObject({ name: "ApplicationError", code: "VERSION_CONFLICT" });

    await expect(admin`
      update app.applications set status = 'SUBMITTED' where id = ${selectedId}
    `).rejects.toMatchObject({ code: "23514", constraint_name: "applications_selected_immutable" });
    await expect(admin`
      update app.projects set published_spec_snapshot = '{}'::jsonb where id = ${project.id}
    `).rejects.toMatchObject({ code: "23514", constraint_name: "projects_published_snapshot_immutable" });
    await expect(admin`
      insert into app.applications (id, project_id, builder_id, statement, status, spec_version_id)
      values (${randomUUID()}, ${project.id}, ${builderC.id}, 'second selected', 'SELECTED', ${project.lockedSpecVersionId})
    `).rejects.toMatchObject({ code: "23505", constraint_name: "applications_one_selected_per_project_unique" });
    await expect(admin.begin((transaction) => transaction`
      update app.projects
      set status = 'AWAITING_BUILDER', selected_application_id = ${selectedId}
      where id = ${otherProject.project.id}
    `)).rejects.toMatchObject({ code: "23503", constraint_name: "projects_selected_application_fk" });
  }, 30000);

  it("does not select a Builder account disabled after application", async () => {
    const { project } = await createPublishedProject(enterpriseA, "失效申请项目");
    const application = await apply(builderC, project.id, "Still interested.");
    await admin`update app.users set status = 'DISABLED' where id = ${builderC.id}`;
    try {
      await expect(selectApplicationWithDatabase(database, enterpriseA, {
        projectId: project.id,
        applicationId: application.applicationId,
        expectedVersion: project.version,
      })).rejects.toMatchObject({ name: "ApplicationError", code: "ALREADY_SELECTED" });
    } finally {
      await admin`update app.users set status = 'ACTIVE' where id = ${builderC.id}`;
    }
  }, 30000);
});
