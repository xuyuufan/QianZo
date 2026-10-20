import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { assertActiveActor, type Actor } from "@/modules/identity/onboarding";
import { parseRecruitmentSnapshot } from "@/modules/recruitment/snapshot";
import { projectIdSchema } from "@/modules/projects/validation";
import { specLimits } from "@/modules/specs/document";
import { safeDeliveryUrlSchema } from "@/modules/delivery/validation";
import type { Database } from "@/platform/db/client";
import type { MilestoneStatus } from "@/platform/db/schema";
import {
  applications,
  milestones,
  projects,
  submissionReviews,
  submissions,
} from "@/platform/db/schema";

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

const historyLinksSchema = z.array(safeDeliveryUrlSchema).min(1).max(10);
const historyReviewSchema = z.object({
  outcome: z.enum(["PASS", "FAIL"]),
  criteriaResults: z.array(
    z.object({ position: z.number().int().min(1).max(20), outcome: z.enum(["PASS", "FAIL"]) }).strict(),
  ).min(1).max(20),
  reason: z.string().nullable(),
});

/** Returns only a project's public execution snapshot to its active owner or engaged Builder. */
export async function getWorkspaceWithDatabase(
  database: Database,
  actor: Actor,
  rawProjectId: unknown,
): Promise<WorkspaceDTO | null> {
  assertActiveActor(actor);
  const projectId = projectIdSchema.parse(rawProjectId);
  return database.transaction(
    (transaction) => readWorkspaceSnapshot(transaction, actor, projectId),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

type WorkspaceReadDatabase = Pick<Database, "select">;

async function readWorkspaceSnapshot(
  database: WorkspaceReadDatabase,
  actor: Actor,
  projectId: string,
): Promise<WorkspaceDTO | null> {

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
      completedAt: projects.completedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (
    !project ||
    !(["IN_PROGRESS", "FINAL_REVIEW", "COMPLETED"] as const).includes(
      project.status as "IN_PROGRESS" | "FINAL_REVIEW" | "COMPLETED",
    ) ||
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
      currentSubmissionId: milestones.currentSubmissionId,
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
    if (!(["PENDING", "IN_PROGRESS", "IN_REVIEW", "REVISION", "APPROVED"] as const).includes(
      row.status as MilestoneStatus,
    )) return null;
    safeMilestones.push({
      id: row.id,
      currentSubmissionId: row.currentSubmissionId,
      position: row.position,
      title: row.title,
      description: row.description,
      deadline: row.deadline.toISOString(),
      status: row.status as MilestoneStatus,
      submissions: [],
      deliverables: deliverables.data,
      acceptanceCriteria: acceptanceCriteria.data,
    });
  }

  if (safeMilestones.length !== snapshot.document.milestones.length) return null;

  const historyRows = await database
    .select({ submission: submissions, review: submissionReviews })
    .from(submissions)
    .leftJoin(submissionReviews, eq(submissionReviews.submissionId, submissions.id))
    .where(eq(submissions.projectId, project.id))
    .orderBy(asc(submissions.milestoneId), asc(submissions.sequence));
  const milestoneById = new Map(safeMilestones.map((milestone) => [milestone.id, milestone]));
  for (const { submission, review } of historyRows) {
    const milestone = milestoneById.get(submission.milestoneId);
    const links = historyLinksSchema.safeParse(submission.links);
    const parsedReview = review
      ? historyReviewSchema.safeParse({
          outcome: review.outcome,
          criteriaResults: review.criteriaResults,
          reason: review.reason,
        })
      : null;
    if (!milestone || !links.success || (parsedReview && !parsedReview.success)) return null;
    milestone.submissions.push({
      id: submission.id,
      sequence: submission.sequence,
      summary: submission.summary,
      links: links.data,
      createdAt: submission.createdAt.toISOString(),
      review: parsedReview?.success
        ? {
            ...parsedReview.data,
            createdAt: review!.createdAt.toISOString(),
          }
        : null,
    });
  }

  for (const row of rows) {
    const milestone = milestoneById.get(row.id);
    if (!milestone) return null;
    const latestSubmission = milestone.submissions.at(-1);
    if (row.currentSubmissionId !== (latestSubmission?.id ?? null)) return null;
    if (
      (["IN_REVIEW", "REVISION", "APPROVED"] as const).includes(
        row.status as "IN_REVIEW" | "REVISION" | "APPROVED",
      ) && !latestSubmission
    ) return null;
    if (latestSubmission?.review && row.status === "IN_REVIEW") return null;
  }

  return {
    projectId: project.id,
    viewerRole,
    title: snapshot.title,
    startedAt: project.startedAt.toISOString(),
    status: project.status as "IN_PROGRESS" | "FINAL_REVIEW" | "COMPLETED",
    completedAt: project.completedAt?.toISOString() ?? null,
    milestones: safeMilestones,
  };
}
