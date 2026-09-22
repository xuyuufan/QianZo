import { and, desc, eq, sql } from "drizzle-orm";

import type { Actor } from "@/modules/identity/onboarding";
import { IdentityError } from "@/modules/identity/onboarding";
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
  if (actor.status !== "ACTIVE") {
    throw new IdentityError("ACTOR_DISABLED", "This account is disabled.");
  }
  if (!actor.roles.includes("ENTERPRISE")) {
    throw new IdentityError("ROLE_REQUIRED", "The ENTERPRISE role is required.");
  }
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

export async function createProjectWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<Project> {
  assertEnterprise(actor);
  const input: CreateProjectInput = createProjectInputSchema.parse(rawInput);

  return database.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(projects)
      .values({
        id: input.projectId,
        ownerId: actor.id,
        title: input.title,
        originalRequirement: input.originalRequirement,
      })
      .onConflictDoNothing()
      .returning();

    if (created) return created;

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
