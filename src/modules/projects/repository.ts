import { and, desc, eq, sql } from "drizzle-orm";
import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import type { Database } from "@/platform/db/client";
import { projects } from "@/platform/db/schema";

import {
  createProjectInputSchema,
  projectIdSchema,
  updateProjectInputSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "./validation";

export type Project = typeof projects.$inferSelect;

export class ProjectError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CREATE_CONFLICT" | "VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

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
        current_spec_version_id, created_at, updated_at
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

  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, actor.id)))
      .limit(1)
      .for("update");

    if (!current) {
      throw new ProjectError("NOT_FOUND", "Project not found.");
    }
    if (current.version !== input.expectedVersion) {
      throw new ProjectError("VERSION_CONFLICT", "The project has changed since it was opened.");
    }

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
  });
}
