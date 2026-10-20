import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { assertActiveActor, type Actor } from "@/modules/identity/onboarding";
import { parseRecruitmentSnapshot } from "@/modules/recruitment/snapshot";
import { projectIdSchema } from "@/modules/projects/validation";
import { specLimits } from "@/modules/specs/document";
import type { Database } from "@/platform/db/client";
import { applications, milestones, projects } from "@/platform/db/schema";

import type { WorkspaceDTO } from "./dto";

const publicDeliverablesSchema = z.array(
  z.object({
    title: z.string().min(1).max(specLimits.shortTextLength),
    description: z.string().max(specLimits.longTextLength),
  }),
);

const publicAcceptanceCriteriaSchema = z.array(
  z.object({
    description: z.string().min(1).max(specLimits.longTextLength),
    verificationMethod: z.string().min(1).max(specLimits.longTextLength),
  }),
);

/** Returns only a project's public execution snapshot to its active owner or engaged Builder. */
export async function getWorkspaceWithDatabase(
  database: Database,
  actor: Actor,
  rawProjectId: unknown,
): Promise<WorkspaceDTO | null> {
  assertActiveActor(actor);
  const projectId = projectIdSchema.parse(rawProjectId);

  const [project] = await database
    .select({
      id: projects.id,
      ownerId: projects.ownerId,
      status: projects.status,
      selectedApplicationId: projects.selectedApplicationId,
      lockedSpecVersionId: projects.lockedSpecVersionId,
      publishedAt: projects.publishedAt,
      snapshot: projects.publishedSpecSnapshot,
      startedAt: projects.startedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (
    !project ||
    project.status !== "IN_PROGRESS" ||
    !project.selectedApplicationId ||
    !project.lockedSpecVersionId ||
    !project.publishedAt ||
    !project.startedAt
  ) {
    return null;
  }

  const snapshot = parseRecruitmentSnapshot(project.snapshot);
  if (!snapshot || snapshot.lockedSpecVersionId !== project.lockedSpecVersionId) return null;

  const [selectedApplication] = await database
    .select({
      builderId: applications.builderId,
      specVersionId: applications.specVersionId,
      status: applications.status,
    })
    .from(applications)
    .where(and(eq(applications.projectId, project.id), eq(applications.id, project.selectedApplicationId)))
    .limit(1);
  if (
    !selectedApplication ||
    selectedApplication.status !== "ENGAGED" ||
    selectedApplication.specVersionId !== project.lockedSpecVersionId
  ) {
    return null;
  }

  const canReadAsOwner = project.ownerId === actor.id && actor.roles.includes("ENTERPRISE");
  const canReadAsBuilder = selectedApplication.builderId === actor.id && actor.roles.includes("BUILDER");
  const viewerRole = canReadAsOwner ? "owner" : canReadAsBuilder ? "builder" : null;
  if (!viewerRole) return null;

  const rows = await database
    .select({
      id: milestones.id,
      position: milestones.position,
      title: milestones.title,
      description: milestones.description,
      deadline: milestones.deadline,
      status: milestones.status,
      deliverables: milestones.deliverables,
      acceptanceCriteria: milestones.acceptanceCriteria,
    })
    .from(milestones)
    .where(eq(milestones.projectId, project.id))
    .orderBy(asc(milestones.position));

  const safeMilestones: WorkspaceDTO["milestones"] = [];
  for (const row of rows) {
    const deliverables = publicDeliverablesSchema.safeParse(row.deliverables);
    const acceptanceCriteria = publicAcceptanceCriteriaSchema.safeParse(row.acceptanceCriteria);
    if (!deliverables.success || !acceptanceCriteria.success) return null;
    if (row.status !== "PENDING" && row.status !== "IN_PROGRESS") return null;
    safeMilestones.push({
      id: row.id,
      position: row.position,
      title: row.title,
      description: row.description,
      deadline: row.deadline.toISOString(),
      status: row.status,
      deliverables: deliverables.data,
      acceptanceCriteria: acceptanceCriteria.data,
    });
  }

  if (safeMilestones.length !== snapshot.document.milestones.length) return null;
  return {
    projectId: project.id,
    viewerRole,
    title: snapshot.title,
    startedAt: project.startedAt.toISOString(),
    milestones: safeMilestones,
  };
}
