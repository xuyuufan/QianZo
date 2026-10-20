import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyToProjectWithDatabase, selectApplicationWithDatabase } from "@/modules/applications/repository";
import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import { builderDeposit, mockPaymentProvider } from "@/modules/payments/mock-provider";
import {
  createBuilderDepositWithDatabase,
  getBuilderDepositWithDatabase,
  simulateBuilderDepositSuccessWithDatabase,
} from "@/modules/payments/repository";
import { publishProjectWithDatabase } from "@/modules/projects/publish";
import { getWorkspaceWithDatabase } from "@/modules/workspace/repository";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";
import type { SpecDocumentV1 } from "@/modules/specs/document";

import { clearDemoBusinessData } from "../helpers/demo-data";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { createDepositPaidProject } from "../helpers/project-fixture";
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

function longValidDocument(): SpecDocumentV1 {
  const document = validSpecDocument();
  document.deliverables[0].title = "交付".repeat(75);
  document.deliverables[0].description = "交付说明。".repeat(300);
  document.milestones[0].title = "阶段".repeat(75);
  document.milestones[0].description = "阶段说明。".repeat(300);
  document.milestones[0].acceptanceCriteria[0].description = "验收条件。".repeat(300);
  document.milestones[0].acceptanceCriteria[0].verificationMethod = "验证方法。".repeat(300);
  return document;
}

async function createPublishedProject(owner: Actor, title: string, document = validSpecDocument()) {
  const paid = await createDepositPaidProject(database, owner, {
    title: `PRIVATE-${title}`,
    originalRequirement: `PRIVATE requirement ${title}`,
    document,
  });
  const publicationInput = {
    projectId: paid.fixture.project.id,
    expectedVersion: paid.projectVersion,
    lockedSpecVersionId: paid.fixture.specVersion.id,
    maskedTitle: title,
    maskedDocument: document,
    confirmed: "on",
  };
  const project = await publishProjectWithDatabase(database, owner, publicationInput);
  return { project, specVersionId: paid.fixture.specVersion.id, publicationInput };
}

async function selectFromOpenProject(owner: Actor, project: Awaited<ReturnType<typeof createPublishedProject>>["project"], selected: Actor, other?: Actor) {
  const selectedApplication = await applyToProjectWithDatabase(database, selected, {
    projectId: project.id,
    statement: `Statement from ${selected.displayName}.`,
  });
  const otherApplication = other
    ? await applyToProjectWithDatabase(database, other, {
        projectId: project.id,
        statement: `Statement from ${other.displayName}.`,
      })
    : null;
  const selectionInput = {
    projectId: project.id,
    applicationId: selectedApplication.applicationId,
    expectedVersion: project.version,
  };
  await selectApplicationWithDatabase(database, owner, selectionInput);
  return { selectedApplication, otherApplication, selectionInput };
}

async function countBuilderPayments(projectId: string) {
  const [row] = await admin<{ count: string }[]>`
    select count(*)::text as count
    from app.payments
    where project_id = ${projectId} and purpose = 'BUILDER_DEPOSIT'
  `;
  return Number(row.count);
}

async function readReplayState(projectId: string) {
  const [project] = await admin<
    {
      status: string;
      version: number;
      published_at: Date | null;
      updated_at: Date;
      published_spec_snapshot: unknown;
      selected_application_id: string | null;
      started_at: Date | null;
    }[]
  >`
    select status, version, published_at, updated_at, published_spec_snapshot,
      selected_application_id, started_at
    from app.projects where id = ${projectId}
  `;
  const applications = await admin<{ id: string; status: string; updated_at: Date }[]>`
    select id, status, updated_at from app.applications where project_id = ${projectId} order by id
  `;
  const payments = await admin<
    { id: string; purpose: string; status: string; succeeded_at: Date | null; updated_at: Date }[]
  >`
    select id, purpose, status, succeeded_at, updated_at from app.payments
    where project_id = ${projectId} order by purpose
  `;
  const milestones = await admin<
    { id: string; position: number; status: string; deadline: Date; spec_version_id: string }[]
  >`
    select id, position, status, deadline, spec_version_id from app.milestones
    where project_id = ${projectId} order by position
  `;
  return { project, applications, payments, milestones };
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
    ensureAuthUser("builder-start-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("builder-start-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("builder-start-builder-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("builder-start-builder-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("builder-start-builder-c@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await clearDemoBusinessData(admin, userIds);
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "开工测试企业 A",
    roles: ["ENTERPRISE", "BUILDER"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "开工测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builderA = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "开工测试 Builder A",
    roles: ["BUILDER", "ENTERPRISE"],
  });
  builderB = await completeOnboardingWithDatabase(database, userIds[3], {
    displayName: "开工测试 Builder B",
    roles: ["BUILDER"],
  });
  builderC = await completeOnboardingWithDatabase(database, userIds[4], {
    displayName: "开工测试 Builder C",
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

describe("Builder Mock deposit and atomic project start", () => {
  it("replays the original publish and selection intents after start without changing state", async () => {
    const document = validSpecDocument();
    const { project, publicationInput } = await createPublishedProject(
      enterpriseA,
      "开工后重放项目",
      document,
    );
    const { selectedApplication, otherApplication, selectionInput } = await selectFromOpenProject(
      enterpriseA,
      project,
      builderA,
      builderB,
    );
    if (!otherApplication) throw new Error("Expected an alternate submitted application.");

    const payment = await createBuilderDepositWithDatabase(database, builderA, mockPaymentProvider, {
      projectId: project.id,
    });
    await simulateBuilderDepositSuccessWithDatabase(database, builderA, {
      projectId: project.id,
      paymentId: payment.id,
    });

    const beforeReplay = await readReplayState(project.id);
    expect(beforeReplay.project.status).toBe("IN_PROGRESS");
    expect(beforeReplay.project.selected_application_id).toBe(selectedApplication.applicationId);
    expect(beforeReplay.project.started_at).toBeInstanceOf(Date);

    // Keep both old requests in flight against the same real, post-start state
    // so the pre-fix integration test records each replay failure.
    const [publishResult, selectionResult] = await Promise.allSettled([
      publishProjectWithDatabase(database, enterpriseA, publicationInput),
      selectApplicationWithDatabase(database, enterpriseA, selectionInput),
    ]);
    expect.soft(publishResult.status).toBe("fulfilled");
    expect.soft(selectionResult.status).toBe("fulfilled");
    if (publishResult.status !== "fulfilled" || selectionResult.status !== "fulfilled") {
      throw new Error("Expected both original intents to replay successfully after start.");
    }
    expect(publishResult.value.status).toBe("IN_PROGRESS");
    expect(selectionResult.value).toEqual({
      applicationId: selectedApplication.applicationId,
      version: beforeReplay.project.version,
      alreadySelected: true,
    });
    expect(await readReplayState(project.id)).toEqual(beforeReplay);

    const changedDocument = structuredClone(document);
    changedDocument.projectGoal = "不同的发布预览。";
    await expect(
      publishProjectWithDatabase(database, enterpriseA, {
        ...publicationInput,
        maskedDocument: changedDocument,
      }),
    ).rejects.toMatchObject({ name: "ProjectError", code: "PUBLISH_CONFLICT" });
    await expect(
      selectApplicationWithDatabase(database, enterpriseA, {
        ...selectionInput,
        applicationId: otherApplication.applicationId,
      }),
    ).rejects.toMatchObject({ name: "ApplicationError", code: "VERSION_CONFLICT" });
    expect(await readReplayState(project.id)).toEqual(beforeReplay);

    await expect(publishProjectWithDatabase(database, enterpriseB, publicationInput)).rejects.toMatchObject({
      name: "ProjectError",
      code: "NOT_FOUND",
    });
    await expect(publishProjectWithDatabase(database, builderB, publicationInput)).rejects.toMatchObject({
      name: "IdentityError",
      code: "ROLE_REQUIRED",
    });
    await expect(selectApplicationWithDatabase(database, enterpriseB, selectionInput)).rejects.toMatchObject({
      name: "ApplicationError",
      code: "NOT_FOUND",
    });
    await expect(selectApplicationWithDatabase(database, builderB, selectionInput)).rejects.toMatchObject({
      name: "IdentityError",
      code: "ROLE_REQUIRED",
    });
    expect(await readReplayState(project.id)).toEqual(beforeReplay);
  }, 60000);

  it("creates one fixed deposit, starts the project once and exposes a safe Workspace", async () => {
    const document = longValidDocument();
    expect(document.milestones[0].description.length).toBeGreaterThan(1000);
    expect(document.deliverables[0].description.length).toBeGreaterThan(1000);
    const { project } = await createPublishedProject(enterpriseA, "公开开工项目", document);
    const { selectedApplication, otherApplication } = await selectFromOpenProject(
      enterpriseA,
      project,
      builderA,
      builderB,
    );
    expect(otherApplication).not.toBeNull();

    await expect(
      createBuilderDepositWithDatabase(database, builderC, mockPaymentProvider, { projectId: project.id }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "NOT_FOUND" });
    expect(await getWorkspaceWithDatabase(database, builderA, project.id)).toBeNull();

    const payments = await Promise.all([
      createBuilderDepositWithDatabase(database, builderA, mockPaymentProvider, { projectId: project.id }),
      createBuilderDepositWithDatabase(database, builderA, mockPaymentProvider, { projectId: project.id }),
    ]);
    expect(payments[0]).toEqual(payments[1]);
    expect(payments[0]).toMatchObject({
      status: "PENDING",
      amountMinor: builderDeposit.amountMinor,
      currency: builderDeposit.currency,
    });
    expect(Object.keys(payments[0]).sort()).toEqual(["amountMinor", "currency", "id", "status"]);
    expect(await countBuilderPayments(project.id)).toBe(1);
    const [versionAfterSelection] = await admin<{ version: number }[]>`
      select version from app.projects where id = ${project.id}
    `;
    expect(versionAfterSelection.version).toBe(project.version + 1);

    const pending = await getBuilderDepositWithDatabase(database, builderA, project.id);
    expect(pending).toEqual({
      projectId: project.id,
      applicationId: selectedApplication.applicationId,
      payment: payments[0],
    });
    expect(await getBuilderDepositWithDatabase(database, builderB, project.id)).toBeNull();

    const successes = await Promise.all([
      simulateBuilderDepositSuccessWithDatabase(database, builderA, {
        projectId: project.id,
        paymentId: payments[0].id,
      }),
      simulateBuilderDepositSuccessWithDatabase(database, builderA, {
        projectId: project.id,
        paymentId: payments[0].id,
      }),
    ]);
    expect(successes[0]).toEqual(successes[1]);
    expect(successes[0].status).toBe("SUCCEEDED");
    expect(await getBuilderDepositWithDatabase(database, builderA, project.id)).toMatchObject({
      payment: { id: payments[0].id, status: "SUCCEEDED", amountMinor: 100, currency: "CNY" },
    });

    const [started] = await admin<
      { status: string; version: number; started_at: Date; selected_application_id: string | null; locked_spec_version_id: string }[]
    >`
      select status, version, started_at, selected_application_id, locked_spec_version_id
      from app.projects where id = ${project.id}
    `;
    expect(started).toMatchObject({
      status: "IN_PROGRESS",
      version: project.version + 2,
      selected_application_id: selectedApplication.applicationId,
    });
    expect(started.started_at).toBeInstanceOf(Date);

    const appRows = await admin<{ id: string; status: string }[]>`
      select id, status from app.applications where project_id = ${project.id} order by id
    `;
    expect(appRows.find((row) => row.id === selectedApplication.applicationId)?.status).toBe("ENGAGED");
    expect(appRows.find((row) => row.id === otherApplication?.applicationId)?.status).toBe("REJECTED");

    const milestoneRows = await admin<
      { position: number; spec_version_id: string; status: string; deadline: Date; deliverables: unknown; acceptance_criteria: unknown }[]
    >`
      select position, spec_version_id, status, deadline, deliverables, acceptance_criteria
      from app.milestones where project_id = ${project.id} order by position
    `;
    expect(milestoneRows).toHaveLength(2);
    expect(milestoneRows.map((row) => row.position)).toEqual([1, 2]);
    expect(milestoneRows.map((row) => row.status)).toEqual(["IN_PROGRESS", "PENDING"]);
    expect(milestoneRows.every((row) => row.spec_version_id === started.locked_spec_version_id)).toBe(true);
    expect(milestoneRows[0].deadline.getTime() - started.started_at.getTime()).toBe(10 * 86_400_000);
    expect(milestoneRows[1].deadline.getTime() - started.started_at.getTime()).toBe(24 * 86_400_000);

    const workspace = await getWorkspaceWithDatabase(database, builderA, project.id);
    expect(workspace).not.toBeNull();
    expect(workspace).toMatchObject({
      projectId: project.id,
      viewerRole: "builder",
      title: "公开开工项目",
      milestones: [
        {
          position: 1,
          title: document.milestones[0].title,
          description: document.milestones[0].description,
          status: "IN_PROGRESS",
          deliverables: [{ title: document.deliverables[0].title, description: document.deliverables[0].description }],
        },
        { position: 2, title: document.milestones[1].title, status: "PENDING" },
      ],
    });
    if (!workspace) throw new Error("Expected the engaged Builder to read the Workspace.");
    const ownerWorkspace = await getWorkspaceWithDatabase(database, enterpriseA, project.id);
    expect(ownerWorkspace).toEqual({ ...workspace, viewerRole: "owner" });
    expect(await getWorkspaceWithDatabase(database, enterpriseB, project.id)).toBeNull();
    expect(await getWorkspaceWithDatabase(database, builderB, project.id)).toBeNull();
    const serializedWorkspace = JSON.stringify(workspace);
    for (const marker of [
      "PRIVATE-",
      "PRIVATE requirement",
      "milestone-core",
      "deliverable-app",
      "criterion-core-1",
      "originalRequirement",
      "acceptanceCriteriaId",
      "payerId",
      "builderId",
    ]) {
      expect(serializedWorkspace).not.toContain(marker);
    }

    const [beforeReplay] = await admin<{ succeeded_at: Date; updated_at: Date }[]>`
      select succeeded_at, updated_at from app.payments where id = ${payments[0].id}
    `;
    const replay = await simulateBuilderDepositSuccessWithDatabase(database, builderA, {
      projectId: project.id,
      paymentId: payments[0].id,
    });
    expect(replay.status).toBe("SUCCEEDED");
    const [afterReplay] = await admin<{ succeeded_at: Date; updated_at: Date }[]>`
      select succeeded_at, updated_at from app.payments where id = ${payments[0].id}
    `;
    expect(afterReplay).toEqual(beforeReplay);

    await expect(admin`
      update app.projects set started_at = started_at + interval '1 second' where id = ${project.id}
    `).rejects.toMatchObject({ code: "23514", constraint_name: "projects_started_at_immutable" });
    await expect(admin`
      update app.projects set published_spec_snapshot = '{}'::jsonb where id = ${project.id}
    `).rejects.toMatchObject({ code: "23514", constraint_name: "projects_published_snapshot_immutable" });
    await expect(admin`
      update app.applications set status = 'SELECTED' where id = ${selectedApplication.applicationId}
    `).rejects.toMatchObject({ code: "23514", constraint_name: "applications_selected_immutable" });
    await expect(admin`
      update app.milestones set description = 'rewritten' where project_id = ${project.id}
    `).rejects.toMatchObject({ code: "23514", constraint_name: "milestones_snapshot_immutable" });
  }, 60000);

  it("requires the selected active Builder and enterprise success and enforces payment keys", async () => {
    const { project } = await createPublishedProject(enterpriseA, "支付前置条件项目");
    const { selectedApplication } = await selectFromOpenProject(enterpriseA, project, builderA);

    const [ownerDeposit] = await admin<{ id: string }[]>`
      select id from app.payments where project_id = ${project.id} and purpose = 'ENTERPRISE_DEPOSIT'
    `;
    expect(ownerDeposit).toBeDefined();
    await admin`
      delete from app.payments where project_id = ${project.id} and purpose = 'ENTERPRISE_DEPOSIT'
    `;
    await expect(
      createBuilderDepositWithDatabase(database, builderA, mockPaymentProvider, { projectId: project.id }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "PAYMENT_REQUIRED" });
    expect(await countBuilderPayments(project.id)).toBe(0);
    await admin`
      insert into app.payments (id, project_id, payer_id, purpose, amount_minor, currency, status, succeeded_at)
      values (${ownerDeposit.id}, ${project.id}, ${enterpriseA.id}, 'ENTERPRISE_DEPOSIT', 100, 'CNY', 'SUCCEEDED', now())
    `;
    const localPayment = await createBuilderDepositWithDatabase(database, builderA, mockPaymentProvider, {
      projectId: project.id,
    });
    await admin`
      delete from app.payments where project_id = ${project.id} and purpose = 'ENTERPRISE_DEPOSIT'
    `;
    await expect(
      simulateBuilderDepositSuccessWithDatabase(database, builderA, {
        projectId: project.id,
        paymentId: localPayment.id,
      }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "PAYMENT_REQUIRED" });
    const [stillPending] = await admin<{ status: string }[]>`
      select status from app.payments where id = ${localPayment.id}
    `;
    const [stillAwaiting] = await admin<{ project_status: string; application_status: string }[]>`
      select p.status as project_status, a.status as application_status
      from app.projects p join app.applications a on a.project_id = p.id and a.id = ${selectedApplication.applicationId}
      where p.id = ${project.id}
    `;
    expect(stillPending.status).toBe("PENDING");
    expect(stillAwaiting).toEqual({ project_status: "AWAITING_BUILDER", application_status: "SELECTED" });

    const anotherProject = await createPublishedProject(enterpriseB, "另一项目申请");
    const { selectedApplication: foreignApplication } = await selectFromOpenProject(
      enterpriseB,
      anotherProject.project,
      builderA,
    );
    await expect(admin`
      insert into app.payments (id, project_id, application_id, payer_id, purpose, amount_minor, currency)
      values (${randomUUID()}, ${project.id}, ${foreignApplication.applicationId}, ${builderA.id}, 'BUILDER_DEPOSIT', 100, 'CNY')
    `).rejects.toMatchObject({ code: "23503", constraint_name: "payments_project_application_fk" });

    const foreignPayment = await createBuilderDepositWithDatabase(
      database,
      builderA,
      mockPaymentProvider,
      { projectId: anotherProject.project.id },
    );
    await expect(
      simulateBuilderDepositSuccessWithDatabase(database, builderA, {
        projectId: project.id,
        paymentId: foreignPayment.id,
      }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "NOT_FOUND" });
    await expect(
      simulateBuilderDepositSuccessWithDatabase(database, builderA, {
        projectId: anotherProject.project.id,
        paymentId: localPayment.id,
      }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "NOT_FOUND" });

    await expect(
      simulateBuilderDepositSuccessWithDatabase(database, builderB, {
        projectId: project.id,
        paymentId: randomUUID(),
      }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "NOT_FOUND" });
    await expect(
      createBuilderDepositWithDatabase(database, { ...builderA, status: "DISABLED" }, mockPaymentProvider, {
        projectId: project.id,
      }),
    ).rejects.toMatchObject({ name: "IdentityError", code: "ACTOR_DISABLED" });

    // Restore the enterprise payment so the Builder-order key can be checked
    // on the original selected application.
    await admin`
      insert into app.payments (id, project_id, payer_id, purpose, amount_minor, currency, status, succeeded_at)
      values (${randomUUID()}, ${project.id}, ${enterpriseA.id}, 'ENTERPRISE_DEPOSIT', 100, 'CNY', 'SUCCEEDED', now())
    `;
    const payment = await createBuilderDepositWithDatabase(database, builderA, mockPaymentProvider, {
      projectId: project.id,
    });
    await expect(admin`
      insert into app.payments (id, project_id, application_id, payer_id, purpose, amount_minor, currency)
      values (${randomUUID()}, ${project.id}, ${selectedApplication.applicationId}, ${builderA.id}, 'BUILDER_DEPOSIT', 100, 'CNY')
    `).rejects.toMatchObject({ code: "23505", constraint_name: "payments_builder_application_unique" });
    expect(await countBuilderPayments(project.id)).toBe(1);
    expect(payment.status).toBe("PENDING");
  }, 60000);

  it("rolls back payment, application and project changes if milestone creation fails", async () => {
    const { project, specVersionId } = await createPublishedProject(enterpriseA, "原子回滚项目");
    const { selectedApplication } = await selectFromOpenProject(enterpriseA, project, builderA);
    const payment = await createBuilderDepositWithDatabase(database, builderA, mockPaymentProvider, {
      projectId: project.id,
    });
    await admin`
      insert into app.milestones (
        id, project_id, spec_version_id, spec_milestone_id, position, title, description,
        due_after_days, deliverable_ids, deliverables, acceptance_criteria, status, deadline
      ) values (
        ${randomUUID()}, ${project.id}, ${specVersionId}, 'synthetic-conflict', 1, 'collision', 'synthetic',
        1, '[]'::jsonb, '[]'::jsonb,
        '[{"description":"check","verificationMethod":"check"}]'::jsonb,
        'PENDING', now() + interval '1 day'
      )
    `;

    await expect(
      simulateBuilderDepositSuccessWithDatabase(database, builderA, {
        projectId: project.id,
        paymentId: payment.id,
      }),
    ).rejects.toMatchObject({
      cause: { code: "23505", constraint_name: "milestones_project_position_unique" },
    });
    const [state] = await admin<
      { project_status: string; application_status: string; payment_status: string; started_at: Date | null }[]
    >`
      select p.status as project_status, a.status as application_status, pay.status as payment_status,
        p.started_at
      from app.projects p
      join app.applications a on a.project_id = p.id and a.id = ${selectedApplication.applicationId}
      join app.payments pay on pay.project_id = p.id and pay.application_id = a.id
      where p.id = ${project.id}
    `;
    expect(state).toEqual({
      project_status: "AWAITING_BUILDER",
      application_status: "SELECTED",
      payment_status: "PENDING",
      started_at: null,
    });
    const [count] = await admin<{ count: string }[]>`
      select count(*)::text as count from app.milestones where project_id = ${project.id}
    `;
    expect(count.count).toBe("1");
  }, 60000);
});
