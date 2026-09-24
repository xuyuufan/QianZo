import { randomUUID } from "node:crypto";

import type { Actor } from "@/modules/identity/onboarding";
import { mockPaymentProvider } from "@/modules/payments/mock-provider";
import {
  createEnterpriseDepositWithDatabase,
  simulatePaymentSuccessWithDatabase,
  type Payment,
} from "@/modules/payments/repository";
import { createProjectWithDatabase, saveReferenceBudgetWithDatabase } from "@/modules/projects/repository";
import type { SpecDocumentV1 } from "@/modules/specs/document";
import {
  lockSpecWithDatabase,
  saveSpecVersionWithDatabase,
  type Project,
  type StoredSpecVersion,
} from "@/modules/specs/repository";
import type { Database } from "@/platform/db/client";

import { validSpecDocument } from "./spec-fixture";

export type ProjectWithScope = {
  project: Project;
  withBudget: Project;
  specVersion: StoredSpecVersion;
  /** Project.version after the spec version was saved. */
  projectVersion: number;
};

export type ProjectSetupOptions = {
  title?: string;
  originalRequirement?: string;
  document?: SpecDocumentV1;
};

/**
 * A draft with a reference budget and one saved spec version, which is the state
 * the lock, payment and publish flows start from.
 */
export async function createProjectWithBudgetAndSpec(
  database: Database,
  actor: Actor,
  options: ProjectSetupOptions = {},
): Promise<ProjectWithScope> {
  const project = await createProjectWithDatabase(database, actor, {
    projectId: randomUUID(),
    title: options.title ?? "S1 合成项目",
    originalRequirement: options.originalRequirement ?? "希望把范围锁定后发布招募。",
  });
  const withBudget = await saveReferenceBudgetWithDatabase(database, actor, {
    projectId: project.id,
    expectedVersion: project.version,
    minAmount: "1000",
    maxAmount: "2500.5",
  });
  const specVersion = await saveSpecVersionWithDatabase(database, actor, {
    projectId: project.id,
    expectedVersion: withBudget.version,
    document: options.document ?? validSpecDocument(),
  });

  return { project, withBudget, specVersion, projectVersion: withBudget.version + 1 };
}

/**
 * Locks the current version. The returned fixture reports the version after the
 * lock, so callers do not have to track the increments themselves.
 */
export async function lockProjectScope(
  database: Database,
  actor: Actor,
  fixture: ProjectWithScope,
): Promise<ProjectWithScope> {
  await lockSpecWithDatabase(database, actor, {
    projectId: fixture.specVersion.projectId,
    specVersionId: fixture.specVersion.id,
    expectedVersion: fixture.projectVersion,
  });

  return { ...fixture, projectVersion: fixture.projectVersion + 1 };
}

export type DepositPaidProject = {
  /** Locked project; `projectVersion` is the version right after locking. */
  fixture: ProjectWithScope;
  payment: Payment;
  /** Project version after the successful mock deposit. */
  projectVersion: number;
};

/** A locked project whose mock enterprise deposit already succeeded. */
export async function createDepositPaidProject(
  database: Database,
  actor: Actor,
  options: ProjectSetupOptions = {},
): Promise<DepositPaidProject> {
  const created = await createProjectWithBudgetAndSpec(database, actor, options);
  const fixture = await lockProjectScope(database, actor, created);

  const deposit = await createEnterpriseDepositWithDatabase(database, actor, mockPaymentProvider, {
    projectId: fixture.project.id,
  });
  const payment = await simulatePaymentSuccessWithDatabase(database, actor, {
    paymentId: deposit.id,
  });

  return { fixture, payment, projectVersion: fixture.projectVersion + 1 };
}
