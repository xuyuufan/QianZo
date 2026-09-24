import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import type { Database } from "@/platform/db/client";
import { projects } from "@/platform/db/schema";

import { ProjectError } from "./errors";
import { withProjectLock, type ProjectLockErrors } from "./lock";
import {
  createProjectInputSchema,
  projectIdSchema,
  saveReferenceBudgetInputSchema,
  updateProjectInputSchema,
  type CreateProjectInput,
  type SaveReferenceBudgetInput,
  type UpdateProjectInput,
} from "./validation";

export type Project = typeof projects.$inferSelect;

/** The guards shared by the draft and budget writers on an owned project. */
const projectWriteErrors: ProjectLockErrors = {
  notFound: () => new ProjectError("NOT_FOUND", "Project not found."),
  specLocked: () => new ProjectError("SPEC_LOCKED", "The reviewed scope is locked."),
  versionConflict: () =>
    new ProjectError("VERSION_CONFLICT", "The project has changed since it was opened."),
};

function assertEnterprise(actor: Actor) {
  assertActiveRole(actor, "ENTERPRISE");
}

export async function listOwnProjectsWithDatabase(database: Database, actor: Actor) {
  assertEnterprise(actor);
  return database
    .select()
    .from(projects)
    .where(eq(projects.ownerId, actor.id))
    .orderBy(desc(projects.createdAt));
}

export async function getOwnProjectWithDatabase(
  database: Database,
  actor: Actor,
  projectId: string,
): Promise<Project | null> {
  assertEnterprise(actor);
  const parsedProjectId = projectIdSchema.parse(projectId);
  const [project] = await database
    .select()
    .from(projects)
    .where(and(eq(projects.id, parsedProjectId), eq(projects.ownerId, actor.id)))
    .limit(1);
  return project ?? null;
}

type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  original_requirement: string;
  status: string;
  version: number;
  current_spec_version_id: string | null;
  budget_min_minor: number | null;
  budget_max_minor: number | null;
  currency: string | null;
  locked_spec_version_id: string | null;
  locked_at: Date | null;
  published_spec_snapshot: unknown;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    originalRequirement: row.original_requirement,
    status: row.status,
    version: row.version,
    currentSpecVersionId: row.current_spec_version_id,
    budgetMinMinor: row.budget_min_minor,
    budgetMaxMinor: row.budget_max_minor,
    currency: row.currency,
    lockedSpecVersionId: row.locked_spec_version_id,
    lockedAt: row.locked_at,
    publishedSpecSnapshot: row.published_spec_snapshot,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createProjectWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<Project> {
  assertEnterprise(actor);
  const input: CreateProjectInput = createProjectInputSchema.parse(rawInput);

  return database.transaction(async (transaction) => {
    // Column-scoped INSERT keeps the runtime role from setting status, version,
    // or timestamps; Drizzle would list every table column here.
    const inserted = await transaction.execute<ProjectRow>(sql`
      insert into app.projects (id, owner_id, title, original_requirement)
      values (${input.projectId}, ${actor.id}, ${input.title}, ${input.originalRequirement})
      on conflict do nothing
      returning id, owner_id, title, original_requirement, status, version,
        current_spec_version_id, budget_min_minor, budget_max_minor, currency,
        locked_spec_version_id, locked_at, published_spec_snapshot, published_at,
        created_at, updated_at
    `);
    const created = inserted[0];
    if (created) {
      return toProject(created);
    }

    const [existing] = await transaction
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);

    if (!existing || existing.ownerId !== actor.id) {
      throw new ProjectError("NOT_FOUND", "Project not found.");
    }
    if (
      existing.version === 1 &&
      existing.title === input.title &&
      existing.originalRequirement === input.originalRequirement
    ) {
      return existing;
    }
    throw new ProjectError("CREATE_CONFLICT", "The create intent conflicts with an existing project.");
  });
}

export async function updateProjectDraftWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<Project> {
  assertEnterprise(actor);
  const input: UpdateProjectInput = updateProjectInputSchema.parse(rawInput);

  // A locked scope never changes, including the title, the original requirement
  // and the drafts saved from an old tab; the shared lock checks that first.
  return database.transaction((transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id, expectedVersion: input.expectedVersion },
      projectWriteErrors,
      async () => {
        const [updated] = await transaction
          .update(projects)
          .set({
            title: input.title,
            originalRequirement: input.originalRequirement,
            version: sql`${projects.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.ownerId, actor.id),
              eq(projects.status, "DRAFT"),
              eq(projects.version, input.expectedVersion),
            ),
          )
          .returning();

        if (!updated) {
          throw new ProjectError("VERSION_CONFLICT", "The project has changed since it was opened.");
        }
        return updated;
      },
    ),
  );
}

/**
 * Reference budget for the recruitment view. Only the owning enterprise may set
 * it, only while the scope is unlocked, and only as a complete validated range.
 */
export async function saveReferenceBudgetWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<Project> {
  assertEnterprise(actor);
  const input: SaveReferenceBudgetInput = saveReferenceBudgetInputSchema.parse(rawInput);

  return database.transaction((transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id, expectedVersion: input.expectedVersion },
      projectWriteErrors,
      async () => {
        const [updated] = await transaction
          .update(projects)
          .set({
            budgetMinMinor: input.minMinor,
            budgetMaxMinor: input.maxMinor,
            currency: input.currency,
            version: sql`${projects.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.ownerId, actor.id),
              eq(projects.version, input.expectedVersion),
            ),
          )
          .returning();

        if (!updated) {
          throw new ProjectError("VERSION_CONFLICT", "The project has changed since it was opened.");
        }
        return updated;
      },
    ),
  );
}
