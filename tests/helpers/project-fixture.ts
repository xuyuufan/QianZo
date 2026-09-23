import { randomUUID } from "node:crypto";

import type { Actor } from "@/modules/identity/onboarding";
import { createProjectWithDatabase, saveReferenceBudgetWithDatabase } from "@/modules/projects/repository";
import { lockSpecWithDatabase, saveSpecVersionWithDatabase, type Project, type StoredSpecVersion } from "@/modules/specs/repository";
import type { Database } from "@/platform/db/client";

import { validSpecDocument } from "./spec-fixture";

export type ProjectWithScope = {
  project: Project;
  withBudget: Project;
  specVersion: StoredSpecVersion;
  /** Project.version after the spec version was saved. */
  projectVersion: number;
};

/**
 * A draft with a reference budget and one saved spec version, which is the state
 * both the lock and the payment flows start from.
 */
export async function createProjectWithBudgetAndSpec(
  database: Database,
  actor: Actor,
  options: { title?: string } = {},
): Promise<ProjectWithScope> {
  const project = await createProjectWithDatabase(database, actor, {
    projectId: randomUUID(),
    title: options.title ?? "S1 合成项目",
    originalRequirement: "希望把范围锁定后发布招募。",
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
    document: validSpecDocument(),
  });

  return { project, withBudget, specVersion, projectVersion: withBudget.version + 1 };
}

/** Locks the current version of a project prepared by the helper above. */
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

  return fixture;
}
