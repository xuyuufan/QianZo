import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import { withProjectLock } from "@/modules/projects/lock";
import { applications, projects, userRoles, users } from "@/platform/db/schema";
import type { Database } from "@/platform/db/client";

import { ApplicationError } from "./errors";
import {
  applyToProjectInputSchema,
  getProjectApplicationsInputSchema,
  selectApplicationInputSchema,
} from "./validation";
import { parseRecruitmentSnapshot } from "@/modules/recruitment/snapshot";

export async function applyToProjectWithDatabase(database: Database, actor: Actor, rawInput: unknown) {
  assertActiveRole(actor, "BUILDER");
  const input = applyToProjectInputSchema.parse(rawInput);

  return database.transaction(async (transaction) => {
    // Applicants for one project serialize on the same Project row. The locked
    // Spec pointer and publication state are read only after taking that lock.
    const [project] = await transaction
      .select({
        id: projects.id,
        ownerId: projects.ownerId,
        status: projects.status,
        lockedSpecVersionId: projects.lockedSpecVersionId,
        snapshot: projects.publishedSpecSnapshot,
        publishedAt: projects.publishedAt,
      })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1)
      .for("update");

    if (!project) throw new ApplicationError("NOT_FOUND", "Project not found.");
    const snapshot = parseRecruitmentSnapshot(project.snapshot);
    // Drafts and malformed/unpublished records are indistinguishable from a
    // missing public resource to an applicant.
    if (
      !project.publishedAt ||
      !project.lockedSpecVersionId ||
      !snapshot ||
      snapshot.lockedSpecVersionId !== project.lockedSpecVersionId
    ) {
      throw new ApplicationError("NOT_FOUND", "Project not found.");
    }
    if (project.ownerId === actor.id) {
      throw new ApplicationError("CANNOT_APPLY_TO_OWN_PROJECT", "An owner cannot apply to their own project.");
    }

    const [existing] = await transaction
      .select({ id: applications.id, statement: applications.statement, specVersionId: applications.specVersionId })
      .from(applications)
      .where(and(eq(applications.projectId, project.id), eq(applications.builderId, actor.id)))
      .limit(1);

    if (existing) {
      if (existing.statement === input.statement && existing.specVersionId === project.lockedSpecVersionId) {
        return { applicationId: existing.id, created: false };
      }
      throw new ApplicationError("ALREADY_APPLIED", "The Builder has already applied to this project.");
    }

    if (project.status !== "OPEN") {
      throw new ApplicationError("INVALID_STAGE", "The project is not accepting applications.");
    }

    const applicationId = randomUUID();
    // The runtime role may insert only these five columns; keep DB defaults
    // server-controlled by avoiding Drizzle's implicit default-column list.
    await transaction.execute(sql`
      insert into app.applications (id, project_id, builder_id, statement, spec_version_id)
      values (${applicationId}, ${project.id}, ${actor.id}, ${input.statement}, ${project.lockedSpecVersionId})
    `);

    return { applicationId, created: true };
  });
}

export async function listOwnApplicationsWithDatabase(database: Database, actor: Actor) {
  assertActiveRole(actor, "BUILDER");
  const rows = await database
    .select({
      id: applications.id,
      projectId: applications.projectId,
      statement: applications.statement,
      applicationStatus: applications.status,
      appliedAt: applications.createdAt,
      projectStatus: projects.status,
      snapshot: projects.publishedSpecSnapshot,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(applications.builderId, actor.id))
    .orderBy(desc(applications.createdAt));

  return rows.flatMap((row) => {
    const snapshot = parseRecruitmentSnapshot(row.snapshot);
    if (!snapshot) return [];
    return [{
      applicationId: row.id,
      projectId: row.projectId,
      title: snapshot.title,
      statement: row.statement,
      applicationStatus: row.applicationStatus,
      projectStatus: row.projectStatus,
      appliedAt: row.appliedAt,
    }];
  });
}

export async function getOwnApplicationForProjectWithDatabase(
  database: Database,
  actor: Actor,
  rawProjectId: unknown,
) {
  assertActiveRole(actor, "BUILDER");
  const { projectId } = getProjectApplicationsInputSchema.parse({ projectId: rawProjectId });
  const [application] = await database
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(and(eq(applications.projectId, projectId), eq(applications.builderId, actor.id)))
    .limit(1);
  return application ?? null;
}

export async function listProjectApplicationsWithDatabase(
  database: Database,
  actor: Actor,
  rawProjectId: unknown,
) {
  assertActiveRole(actor, "ENTERPRISE");
  const { projectId } = getProjectApplicationsInputSchema.parse({ projectId: rawProjectId });
  const [project] = await database
    .select({ status: projects.status, version: projects.version, selectedApplicationId: projects.selectedApplicationId })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, actor.id)))
    .limit(1);
  if (!project) throw new ApplicationError("NOT_FOUND", "Project not found.");

  const rows = await database
    .select({
      id: applications.id,
      displayName: users.displayName,
      statement: applications.statement,
      status: applications.status,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.builderId))
    .where(eq(applications.projectId, projectId))
    .orderBy(desc(applications.createdAt));

  return {
    projectId,
    projectStatus: project.status,
    version: project.version,
    selectedApplicationId: project.selectedApplicationId,
    applications: rows,
  };
}

export async function selectApplicationWithDatabase(database: Database, actor: Actor, rawInput: unknown) {
  assertActiveRole(actor, "ENTERPRISE");
  const input = selectApplicationInputSchema.parse(rawInput);

  return database.transaction(async (transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id },
      { notFound: () => new ApplicationError("NOT_FOUND", "Project not found.") },
      async (project) => {
        // A replay of the exact selected application succeeds even if its page
        // carries the pre-selection version. Other stale intents fail below.
        if (project.status === "AWAITING_BUILDER" && project.selectedApplicationId === input.applicationId) {
          return { applicationId: input.applicationId, version: project.version, alreadySelected: true };
        }
        if (project.version !== input.expectedVersion) {
          throw new ApplicationError("VERSION_CONFLICT", "The project changed since it was opened.");
        }
        if (
          project.status !== "OPEN" ||
          !project.publishedAt ||
          !project.lockedSpecVersionId ||
          project.selectedApplicationId !== null
        ) {
          throw new ApplicationError("INVALID_STAGE", "The project is not accepting a selection.");
        }

        const [application] = await transaction
          .select({
            id: applications.id,
            builderId: applications.builderId,
            status: applications.status,
            specVersionId: applications.specVersionId,
          })
          .from(applications)
          .where(and(eq(applications.id, input.applicationId), eq(applications.projectId, project.id)))
          .limit(1)
          .for("update");
        if (!application) throw new ApplicationError("NOT_FOUND", "Application not found.");
        if (application.status !== "SUBMITTED") {
          throw new ApplicationError("ALREADY_SELECTED", "The application is no longer available.");
        }
        if (application.specVersionId !== project.lockedSpecVersionId) {
          throw new ApplicationError("INVALID_STAGE", "The application does not match the locked scope.");
        }

        const [candidate] = await transaction
          .select({ status: users.status })
          .from(users)
          .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "BUILDER")))
          .where(eq(users.id, application.builderId))
          .limit(1);
        if (!candidate || candidate.status !== "ACTIVE") {
          throw new ApplicationError("ALREADY_SELECTED", "The application is no longer available.");
        }

        await transaction
          .update(applications)
          .set({ status: "SELECTED", updatedAt: new Date() })
          .where(and(eq(applications.id, application.id), eq(applications.status, "SUBMITTED")));

        const [updated] = await transaction
          .update(projects)
          .set({
            status: "AWAITING_BUILDER",
            selectedApplicationId: application.id,
            version: sql`${projects.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(projects.id, project.id),
              eq(projects.ownerId, actor.id),
              eq(projects.status, "OPEN"),
              eq(projects.version, input.expectedVersion),
            ),
          )
          .returning({ version: projects.version });
        if (!updated) {
          throw new ApplicationError("VERSION_CONFLICT", "The project changed since it was opened.");
        }
        return { applicationId: application.id, version: updated.version, alreadySelected: false };
      },
    ),
  );
}
