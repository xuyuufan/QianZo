import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyToProjectWithDatabase, selectApplicationWithDatabase } from "@/modules/applications/repository";
import {
  completeProjectWithDatabase,
  reviewDeliveryWithDatabase,
  submitDeliveryWithDatabase,
} from "@/modules/delivery/repository";
import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import { mockPaymentProvider } from "@/modules/payments/mock-provider";
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

type Sql = ReturnType<typeof postgres>;

let admin: Sql;
let runtime: Sql;
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

function criteriaFixture(): SpecDocumentV1 {
  const document = structuredClone(validSpecDocument());
  document.milestones[0].acceptanceCriteria.push({
    id: "private-criterion-second",
    description: "记录恢复后的页面状态。",
    verificationMethod: "重新加载并检查历史与状态。",
  });
  return document;
}

async function createStartedProject(owner: Actor, builder: Actor, title: string, document = validSpecDocument()) {
  const paid = await createDepositPaidProject(database, owner, {
    title: `PRIVATE-${title}`,
    originalRequirement: `PRIVATE original requirement for ${title}`,
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
  const application = await applyToProjectWithDatabase(database, builder, {
    projectId: project.id,
    statement: `I can deliver ${title}.`,
  });
  const selectionInput = {
    projectId: project.id,
    applicationId: application.applicationId,
    expectedVersion: project.version,
  };
  await selectApplicationWithDatabase(database, owner, selectionInput);
  const builderPayment = await createBuilderDepositWithDatabase(database, builder, mockPaymentProvider, {
    projectId: project.id,
  });
  await simulateBuilderDepositSuccessWithDatabase(database, builder, {
    projectId: project.id,
    paymentId: builderPayment.id,
  });
  return {
    project,
    publicationInput,
    selectionInput,
    applicationId: application.applicationId,
    builderPaymentId: builderPayment.id,
    specVersionId: paid.fixture.specVersion.id,
  };
}

function submissionInput(projectId: string, milestoneId: string, overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    milestoneId,
    submissionKey: randomUUID(),
    expectedCurrentSubmissionId: null,
    summary: "交付了实现与验证记录。",
    links: ["https://example.com/repository"],
    ...overrides,
  };
}

async function readMilestones(projectId: string) {
  return admin<
    { id: string; position: number; status: string; current_submission_id: string | null }[]
  >`
    select id, position, status, current_submission_id
    from app.milestones where project_id = ${projectId} order by position
  `;
}

async function readProjectState(projectId: string) {
  const [project] = await admin<
    { status: string; version: number; updated_at: Date; completed_at: Date | null }[]
  >`
    select status, version, updated_at, completed_at from app.projects where id = ${projectId}
  `;
  const payments = await admin<{ id: string; status: string; succeeded_at: Date | null; updated_at: Date }[]>`
    select id, status, succeeded_at, updated_at from app.payments
    where project_id = ${projectId} and purpose = 'BUILDER_DEPOSIT'
  `;
  return { project, payments, milestones: await readMilestones(projectId) };
}

async function historyCounts(projectId: string) {
  const [row] = await admin<{ submissions: string; reviews: string }[]>`
    select
      (select count(*)::text from app.submissions where project_id = ${projectId}) as submissions,
      (select count(*)::text from app.submission_reviews where project_id = ${projectId}) as reviews
  `;
  return row;
}

function databaseWithMilestoneReadBarrier(
  source: Database,
  onMilestonesRead: () => void,
  continueRead: Promise<void>,
): Database {
  const wrapQuery = (query: object, pauseAfterResolve: boolean): object => new Proxy(query, {
    get(target, property) {
      if (property === "then" && pauseAfterResolve) {
        const then = Reflect.get(target, property, target) as (
          onFulfilled: (rows: unknown) => unknown,
          onRejected?: (error: unknown) => unknown,
        ) => unknown;
        return (onFulfilled: (rows: unknown) => unknown, onRejected?: (error: unknown) => unknown) =>
          then.call(target, async (rows: unknown) => {
            onMilestonesRead();
            await continueRead;
            return onFulfilled(rows);
          }, onRejected);
      }

      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => wrapQuery(
        value.apply(target, args) as object,
        pauseAfterResolve || (property === "from" && args[0] === schema.milestones),
      );
    },
  });

  return new Proxy(source, {
    get(target, property) {
      if (property === "transaction") {
        return (callback: (transaction: unknown) => Promise<unknown>, config?: unknown) =>
          target.transaction((transaction) => callback(new Proxy(transaction, {
            get(tx, key) {
              if (key === "select") {
                return (...args: unknown[]) => {
                  const select = tx.select as (...values: unknown[]) => object;
                  return wrapQuery(select.apply(tx, args), false);
                };
              }
              return Reflect.get(tx, key, tx);
            },
          })), config as Parameters<Database["transaction"]>[1]);
      }
      return Reflect.get(target, property, target);
    },
  });
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
    ensureAuthUser("delivery-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("delivery-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("delivery-builder-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("delivery-builder-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("delivery-builder-c@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await clearDemoBusinessData(admin, userIds);
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "交付测试企业 A",
    roles: ["ENTERPRISE", "BUILDER"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "交付测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builderA = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "交付测试 Builder A",
    roles: ["BUILDER", "ENTERPRISE"],
  });
  builderB = await completeOnboardingWithDatabase(database, userIds[3], {
    displayName: "交付测试 Builder B",
    roles: ["BUILDER"],
  });
  builderC = await completeOnboardingWithDatabase(database, userIds[4], {
    displayName: "交付测试 Builder C",
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

describe("delivery submissions, immutable reviews and project completion", () => {
  it("keeps FAIL and PASS history, advances milestones in order, and completes only by owner confirmation", async () => {
    const { project, publicationInput, selectionInput, builderPaymentId } = await createStartedProject(
      enterpriseA,
      builderA,
      "完整交付闭环",
      criteriaFixture(),
    );
    const milestones = await readMilestones(project.id);
    expect(milestones.map((row) => row.status)).toEqual(["IN_PROGRESS", "PENDING"]);
    const firstMilestone = milestones[0];
    const secondMilestone = milestones[1];
    await expect(completeProjectWithDatabase(database, enterpriseA, { projectId: project.id }))
      .rejects.toMatchObject({ name: "DeliveryError", code: "INVALID_STAGE" });

    const initialWorkspaceOwner = await getWorkspaceWithDatabase(database, enterpriseA, project.id);
    const initialWorkspaceBuilder = await getWorkspaceWithDatabase(database, builderA, project.id);
    expect(initialWorkspaceOwner?.viewerRole).toBe("owner");
    expect(initialWorkspaceBuilder?.viewerRole).toBe("builder");
    const beforeSubmission = await readProjectState(project.id);
    const privateSpecId = (await admin<{ id: string }[]>`
      select id from app.spec_versions where project_id = ${project.id}
    `)[0].id;
    expect(JSON.stringify(initialWorkspaceOwner)).not.toContain(privateSpecId);
    expect(JSON.stringify(initialWorkspaceOwner)).not.toContain("private-criterion-second");
    expect(JSON.stringify(initialWorkspaceOwner)).not.toContain("PRIVATE original requirement");

    const original = submissionInput(project.id, firstMilestone.id, {
      submissionKey: randomUUID(),
      summary: "第一轮提交，稍后需要返工。",
    });
    const created = await submitDeliveryWithDatabase(database, builderA, original);
    expect(created.replayed).toBe(false);
    expect(created.submission.sequence).toBe(1);
    expect(await submitDeliveryWithDatabase(database, builderA, original)).toEqual({
      ...created,
      replayed: true,
    });
    await expect(submitDeliveryWithDatabase(database, builderA, {
      ...original,
      summary: "同一个提交键不能对应不同内容。",
    })).rejects.toMatchObject({ name: "DeliveryError", code: "CONFLICT" });

    const afterSubmission = await readProjectState(project.id);
    const historyAfterSubmission = await historyCounts(project.id);
    expect(afterSubmission.project.status).toBe("IN_PROGRESS");
    expect(afterSubmission.project.version).toBe(beforeSubmission.project.version + 1);
    expect(afterSubmission.milestones[0].status).toBe("IN_REVIEW");
    expect(afterSubmission.milestones[0].current_submission_id).toBe(created.submission.id);
    expect(historyAfterSubmission).toEqual({ submissions: "1", reviews: "0" });

    for (const unsafeUrl of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "https://user:secret@example.com/",
      "ftp://example.com/file",
    ]) {
      await expect(submitDeliveryWithDatabase(database, builderA, {
        ...submissionInput(project.id, firstMilestone.id),
        links: [unsafeUrl],
      })).rejects.toThrow();
    }

    const reviewInput = {
      projectId: project.id,
      milestoneId: firstMilestone.id,
      submissionId: created.submission.id,
    };
    await expect(reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [{ position: 1, outcome: "PASS" }],
    })).rejects.toMatchObject({ name: "DeliveryError", code: "INVALID_REVIEW" });
    await expect(reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 1, outcome: "FAIL" },
      ],
      reason: "重复项",
    })).rejects.toMatchObject({ name: "DeliveryError", code: "INVALID_REVIEW" });
    await expect(reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 3, outcome: "PASS" },
      ],
    })).rejects.toMatchObject({ name: "DeliveryError", code: "INVALID_REVIEW" });
    await expect(reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 2, outcome: "PASS" },
      ],
      reason: "全 PASS 不应带返工原因。",
    })).rejects.toMatchObject({ name: "DeliveryError", code: "INVALID_REVIEW" });
    await expect(reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 2, outcome: "FAIL" },
      ],
    })).rejects.toMatchObject({ name: "DeliveryError", code: "INVALID_REVIEW" });

    const failedReview = await reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 2, outcome: "FAIL" },
      ],
      reason: "恢复后页面状态没有保持。",
    });
    expect(failedReview).toMatchObject({ outcome: "FAIL", replayed: false, projectStatus: "IN_PROGRESS" });
    const stateAfterFail = await readProjectState(project.id);
    expect(stateAfterFail.milestones[0].status).toBe("REVISION");
    expect(stateAfterFail.milestones[0].current_submission_id).toBe(created.submission.id);
    expect(await historyCounts(project.id)).toEqual({ submissions: "1", reviews: "1" });

    const replayedFail = await reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 2, outcome: "FAIL" },
      ],
      reason: "恢复后页面状态没有保持。",
    });
    expect(replayedFail).toMatchObject({ outcome: "FAIL", replayed: true });
    expect(await readProjectState(project.id)).toEqual(stateAfterFail);
    await expect(reviewDeliveryWithDatabase(database, enterpriseA, {
      ...reviewInput,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 2, outcome: "PASS" },
      ],
    })).rejects.toMatchObject({ name: "DeliveryError", code: "CONFLICT" });

    const revisionInput = submissionInput(project.id, firstMilestone.id, {
      submissionKey: randomUUID(),
      expectedCurrentSubmissionId: created.submission.id,
      summary: "第二轮提交，已保留恢复状态。",
      links: ["https://example.com/revision"],
    });
    const revision = await submitDeliveryWithDatabase(database, builderA, revisionInput);
    expect(revision.submission.sequence).toBe(2);
    expect(revision.replayed).toBe(false);
    expect((await readMilestones(project.id))[0].current_submission_id).toBe(revision.submission.id);

    const beforeOldSubmissionReplay = await readProjectState(project.id);
    const oldSubmissionReplay = await submitDeliveryWithDatabase(database, builderA, original);
    expect(oldSubmissionReplay).toMatchObject({ submission: { id: created.submission.id }, replayed: true });
    expect(await readProjectState(project.id)).toEqual(beforeOldSubmissionReplay);

    const failedRevision = await reviewDeliveryWithDatabase(database, enterpriseA, {
      projectId: project.id,
      milestoneId: firstMilestone.id,
      submissionId: revision.submission.id,
      criteriaResults: [
        { position: 1, outcome: "PASS" },
        { position: 2, outcome: "FAIL" },
      ],
      reason: "第二轮仍需补充验证记录。",
    });
    expect(failedRevision).toMatchObject({ outcome: "FAIL", replayed: false });

    const staleInitialAttempt = submissionInput(project.id, firstMilestone.id, {
      submissionKey: randomUUID(),
      summary: "旧初始表单不能覆盖后续返工轮次。",
    });
    await expect(submitDeliveryWithDatabase(database, builderA, staleInitialAttempt))
      .rejects.toMatchObject({ name: "DeliveryError", code: "CONFLICT" });
    const staleRevisionAttempt = submissionInput(project.id, firstMilestone.id, {
      submissionKey: randomUUID(),
      expectedCurrentSubmissionId: created.submission.id,
      summary: "旧返工页面不能覆盖更新的一轮返工。",
    });
    await expect(submitDeliveryWithDatabase(database, builderA, staleRevisionAttempt))
      .rejects.toMatchObject({ name: "DeliveryError", code: "CONFLICT" });

    const correctedInput = submissionInput(project.id, firstMilestone.id, {
      submissionKey: randomUUID(),
      expectedCurrentSubmissionId: revision.submission.id,
      summary: "第三轮提交，已补齐要求。",
      links: ["https://example.com/corrected"],
    });
    const corrected = await submitDeliveryWithDatabase(database, builderA, correctedInput);
    expect(corrected.submission.sequence).toBe(3);

    const passResults = [
      { position: 1, outcome: "PASS" as const },
      { position: 2, outcome: "PASS" as const },
    ];
    const passInput = {
      projectId: project.id,
      milestoneId: firstMilestone.id,
      submissionId: corrected.submission.id,
      criteriaResults: passResults,
    };
    const passed = await reviewDeliveryWithDatabase(database, enterpriseA, passInput);
    expect(passed).toMatchObject({ outcome: "PASS", projectStatus: "IN_PROGRESS", replayed: false });
    expect(await readMilestones(project.id)).toMatchObject([
      { position: 1, status: "APPROVED", current_submission_id: corrected.submission.id },
      { position: 2, status: "IN_PROGRESS", current_submission_id: null },
    ]);

    const secondSubmission = await submitDeliveryWithDatabase(
      database,
      builderA,
      submissionInput(project.id, secondMilestone.id, { summary: "第二个里程碑成果。" }),
    );
    const [secondPass, concurrentReplay] = await Promise.all([
      reviewDeliveryWithDatabase(database, enterpriseA, {
        projectId: project.id,
        milestoneId: secondMilestone.id,
        submissionId: secondSubmission.submission.id,
        criteriaResults: [{ position: 1, outcome: "PASS" }],
      }),
      reviewDeliveryWithDatabase(database, enterpriseA, {
        projectId: project.id,
        milestoneId: secondMilestone.id,
        submissionId: secondSubmission.submission.id,
        criteriaResults: [{ position: 1, outcome: "PASS" }],
      }),
    ]);
    expect([secondPass.replayed, concurrentReplay.replayed].sort()).toEqual([false, true]);
    expect(secondPass.projectStatus).toBe("FINAL_REVIEW");
    expect(await readProjectState(project.id)).toMatchObject({
      project: { status: "FINAL_REVIEW" },
      milestones: [
        { position: 1, status: "APPROVED" },
        { position: 2, status: "APPROVED" },
      ],
    });
    expect(await historyCounts(project.id)).toEqual({ submissions: "4", reviews: "4" });

    const finalReviewReplay = await reviewDeliveryWithDatabase(database, enterpriseA, passInput);
    expect(finalReviewReplay).toMatchObject({ outcome: "PASS", replayed: true, projectStatus: "FINAL_REVIEW" });
    const beforeS2Replay = await readProjectState(project.id);
    expect((await publishProjectWithDatabase(database, enterpriseA, publicationInput)).status).toBe("FINAL_REVIEW");
    expect(await selectApplicationWithDatabase(database, enterpriseA, selectionInput)).toMatchObject({
      applicationId: selectionInput.applicationId,
      alreadySelected: true,
    });
    expect((await simulateBuilderDepositSuccessWithDatabase(database, builderA, {
      projectId: project.id,
      paymentId: builderPaymentId,
    })).status).toBe("SUCCEEDED");
    expect(await getBuilderDepositWithDatabase(database, builderA, project.id)).toMatchObject({
      payment: { id: builderPaymentId, status: "SUCCEEDED" },
    });
    expect(await readProjectState(project.id)).toEqual(beforeS2Replay);

    await expect(completeProjectWithDatabase(database, builderB, { projectId: project.id }))
      .rejects.toMatchObject({ name: "IdentityError", code: "ROLE_REQUIRED" });
    await expect(completeProjectWithDatabase(database, builderA, { projectId: project.id }))
      .rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });
    await expect(completeProjectWithDatabase(database, enterpriseB, { projectId: project.id }))
      .rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });
    const beforeComplete = await readProjectState(project.id);
    const [completion, completionReplay] = await Promise.all([
      completeProjectWithDatabase(database, enterpriseA, { projectId: project.id }),
      completeProjectWithDatabase(database, enterpriseA, { projectId: project.id }),
    ]);
    expect([completion.replayed, completionReplay.replayed].sort()).toEqual([false, true]);
    const completedState = await readProjectState(project.id);
    expect(completedState.project.status).toBe("COMPLETED");
    expect(completedState.project.completed_at).toBeInstanceOf(Date);
    expect(completedState.project.version).toBe(beforeComplete.project.version + 1);
    expect(await historyCounts(project.id)).toEqual({ submissions: "4", reviews: "4" });

    const afterCompleteReplay = await readProjectState(project.id);
    expect(await publishProjectWithDatabase(database, enterpriseA, publicationInput)).toMatchObject({
      id: project.id,
      status: "COMPLETED",
      version: afterCompleteReplay.project.version,
    });
    expect(await selectApplicationWithDatabase(database, enterpriseA, selectionInput)).toMatchObject({
      applicationId: selectionInput.applicationId,
      version: afterCompleteReplay.project.version,
      alreadySelected: true,
    });
    expect((await simulateBuilderDepositSuccessWithDatabase(database, builderA, {
      projectId: project.id,
      paymentId: builderPaymentId,
    })).status).toBe("SUCCEEDED");
    expect(await getBuilderDepositWithDatabase(database, builderA, project.id)).toMatchObject({
      payment: { id: builderPaymentId, status: "SUCCEEDED" },
    });
    expect(await readProjectState(project.id)).toEqual(afterCompleteReplay);

    await expect(submitDeliveryWithDatabase(database, builderA, submissionInput(
      project.id,
      secondMilestone.id,
      { summary: "完成后不能创建新提交。" },
    ))).rejects.toMatchObject({ name: "DeliveryError", code: "INVALID_STAGE" });
    const ownerCompletedWorkspace = await getWorkspaceWithDatabase(database, enterpriseA, project.id);
    const builderCompletedWorkspace = await getWorkspaceWithDatabase(database, builderA, project.id);
    expect(ownerCompletedWorkspace).toMatchObject({ status: "COMPLETED", viewerRole: "owner" });
    expect(builderCompletedWorkspace).toMatchObject({ status: "COMPLETED", viewerRole: "builder" });
    expect(JSON.stringify(ownerCompletedWorkspace)).not.toContain(privateSpecId);
    expect(JSON.stringify(ownerCompletedWorkspace)).not.toContain("PRIVATE original requirement");
  }, 120000);

  it("enforces participant authorization, same-milestone pointers and single concurrent writes", async () => {
    const first = await createStartedProject(enterpriseA, builderA, "关系与并发项目 A");
    const second = await createStartedProject(enterpriseB, builderC, "关系与并发项目 B");
    const firstMilestones = await readMilestones(first.project.id);
    const secondMilestones = await readMilestones(second.project.id);
    const firstMilestone = firstMilestones[0];

    await expect(submitDeliveryWithDatabase(database, builderB, submissionInput(
      first.project.id,
      firstMilestone.id,
    ))).rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });
    await expect(submitDeliveryWithDatabase(database, enterpriseA, submissionInput(
      first.project.id,
      firstMilestone.id,
    ))).rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });
    await expect(submitDeliveryWithDatabase(database, { ...builderA, status: "DISABLED" }, submissionInput(
      first.project.id,
      firstMilestone.id,
    ))).rejects.toMatchObject({ name: "IdentityError", code: "ACTOR_DISABLED" });
    await expect(submitDeliveryWithDatabase(database, builderA, submissionInput(
      first.project.id,
      secondMilestones[0].id,
    ))).rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });
    await expect(reviewDeliveryWithDatabase(database, enterpriseB, {
      projectId: first.project.id,
      milestoneId: firstMilestone.id,
      submissionId: randomUUID(),
      criteriaResults: [{ position: 1, outcome: "PASS" }],
    })).rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });
    await expect(reviewDeliveryWithDatabase(database, builderA, {
      projectId: first.project.id,
      milestoneId: firstMilestone.id,
      submissionId: randomUUID(),
      criteriaResults: [{ position: 1, outcome: "PASS" }],
    })).rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });
    await expect(reviewDeliveryWithDatabase(database, builderB, {
      projectId: first.project.id,
      milestoneId: firstMilestone.id,
      submissionId: randomUUID(),
      criteriaResults: [{ position: 1, outcome: "PASS" }],
    })).rejects.toMatchObject({ name: "IdentityError", code: "ROLE_REQUIRED" });
    await expect(getWorkspaceWithDatabase(database, builderB, first.project.id)).resolves.toBeNull();
    await expect(getWorkspaceWithDatabase(database, { ...builderA, status: "DISABLED" }, first.project.id))
      .rejects.toMatchObject({ name: "IdentityError", code: "ACTOR_DISABLED" });

    const [winningSubmission, losingSubmission] = await Promise.allSettled([
      submitDeliveryWithDatabase(database, builderA, submissionInput(first.project.id, firstMilestone.id)),
      submitDeliveryWithDatabase(database, builderA, submissionInput(first.project.id, firstMilestone.id)),
    ]);
    expect([winningSubmission.status, losingSubmission.status].sort()).toEqual(["fulfilled", "rejected"]);
    const created = winningSubmission.status === "fulfilled" ? winningSubmission.value : losingSubmission.status === "fulfilled" ? losingSubmission.value : null;
    if (!created) throw new Error("Concurrent submission did not produce one winner.");
    expect(await historyCounts(first.project.id)).toEqual({ submissions: "1", reviews: "0" });

    const foreignSubmission = await submitDeliveryWithDatabase(database, builderC, submissionInput(
      second.project.id,
      secondMilestones[0].id,
    ));
    await expect(reviewDeliveryWithDatabase(database, enterpriseA, {
      projectId: first.project.id,
      milestoneId: firstMilestone.id,
      submissionId: foreignSubmission.submission.id,
      criteriaResults: [{ position: 1, outcome: "PASS" }],
    })).rejects.toMatchObject({ name: "DeliveryError", code: "NOT_FOUND" });

    await expect(admin.begin(async (transaction) => {
      await transaction`
        update app.milestones set current_submission_id = ${created.submission.id}
        where project_id = ${first.project.id} and id = ${firstMilestones[1].id}
      `;
    })).rejects.toMatchObject({ code: "23503", constraint_name: "milestones_current_submission_fk" });
    await expect(admin.begin(async (transaction) => {
      await transaction`
        update app.milestones set current_submission_id = ${created.submission.id}
        where project_id = ${second.project.id} and id = ${secondMilestones[0].id}
      `;
    })).rejects.toMatchObject({ code: "23503", constraint_name: "milestones_current_submission_fk" });
    await expect(admin`
      insert into app.submissions
        (id, project_id, milestone_id, builder_id, sequence, submission_key, summary, links)
      values
        (${randomUUID()}, ${first.project.id}, ${secondMilestones[0].id}, ${builderA.id}, 90, ${randomUUID()},
          'cross-project milestone', '["https://example.com"]'::jsonb)
    `).rejects.toMatchObject({ code: "23503", constraint_name: "submissions_project_milestone_fk" });
    await expect(admin`
      insert into app.submission_reviews
        (id, project_id, milestone_id, submission_id, reviewer_id, outcome, criteria_results, reason)
      values
        (${randomUUID()}, ${first.project.id}, ${firstMilestone.id}, ${foreignSubmission.submission.id},
          ${enterpriseA.id}, 'PASS', '[{"position":1,"outcome":"PASS"}]'::jsonb, null)
    `).rejects.toMatchObject({ code: "23503", constraint_name: "submission_reviews_submission_fk" });

    const reviewInput = {
      projectId: first.project.id,
      milestoneId: firstMilestone.id,
      submissionId: created.submission.id,
      criteriaResults: [{ position: 1, outcome: "PASS" as const }],
    };
    const beforeConcurrentReview = await readProjectState(first.project.id);
    const reviewResults = await Promise.all([
      reviewDeliveryWithDatabase(database, enterpriseA, reviewInput),
      reviewDeliveryWithDatabase(database, enterpriseA, reviewInput),
    ]);
    expect(reviewResults.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect((await readProjectState(first.project.id)).project.version).toBe(beforeConcurrentReview.project.version + 1);
    expect(await historyCounts(first.project.id)).toEqual({ submissions: "1", reviews: "1" });
    await expect(admin`
      insert into app.submission_reviews
        (id, project_id, milestone_id, submission_id, reviewer_id, outcome, criteria_results, reason)
      values
        (${randomUUID()}, ${first.project.id}, ${firstMilestone.id}, ${created.submission.id},
          ${enterpriseA.id}, 'PASS', '[{"position":1,"outcome":"PASS"}]'::jsonb, null)
    `).rejects.toMatchObject({ code: "23505" });

    await expect(runtime`update app.submissions set summary = 'tampered' where id = ${created.submission.id}`)
      .rejects.toMatchObject({ severity: "ERROR" });
    await expect(runtime`delete from app.submission_reviews where submission_id = ${created.submission.id}`)
      .rejects.toMatchObject({ severity: "ERROR" });
  }, 120000);

  it("reads one consistent workspace snapshot while a review commits between queries", async () => {
    const { project } = await createStartedProject(enterpriseA, builderA, "并发读取项目");
    const milestone = (await readMilestones(project.id))[0];
    const submission = await submitDeliveryWithDatabase(
      database,
      builderA,
      submissionInput(project.id, milestone.id),
    );

    let signalMilestoneRead!: () => void;
    const milestoneRead = new Promise<void>((resolve) => { signalMilestoneRead = resolve; });
    let releaseReader!: () => void;
    const continueRead = new Promise<void>((resolve) => { releaseReader = resolve; });
    const pausedDatabase = databaseWithMilestoneReadBarrier(database, signalMilestoneRead, continueRead);
    const workspaceRead = getWorkspaceWithDatabase(pausedDatabase, builderA, project.id);

    await milestoneRead;
    try {
      const review = await reviewDeliveryWithDatabase(database, enterpriseA, {
        projectId: project.id,
        milestoneId: milestone.id,
        submissionId: submission.submission.id,
        criteriaResults: [{ position: 1, outcome: "PASS" }],
      });
      expect(review).toMatchObject({ outcome: "PASS", replayed: false });
    } finally {
      releaseReader();
    }

    const consistentWorkspace = await workspaceRead;
    expect(consistentWorkspace?.status).toBe("IN_PROGRESS");
    expect(consistentWorkspace?.milestones[0]).toMatchObject({
      status: "IN_REVIEW",
      currentSubmissionId: submission.submission.id,
      submissions: [{ id: submission.submission.id, review: null }],
    });
    const currentWorkspace = await getWorkspaceWithDatabase(database, builderA, project.id);
    expect(currentWorkspace?.milestones[0]).toMatchObject({
      status: "APPROVED",
      submissions: [{ id: submission.submission.id, review: { outcome: "PASS" } }],
    });
  }, 120000);
});
