import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import { stableJson } from "@/modules/recruitment/snapshot";
import { withProjectLock, withProjectRowLock } from "@/modules/projects/lock";
import { specLimits } from "@/modules/specs/document";
import type { Database } from "@/platform/db/client";
import {
  applications,
  milestones,
  projects,
  submissionReviews,
  submissions,
} from "@/platform/db/schema";

import type {
  CompletionDTO,
  DeliveryMutationDTO,
  DeliveryReviewDTO,
  ReviewMutationDTO,
  SubmittedDeliveryDTO,
} from "./dto";
import { DeliveryError } from "./errors";
import {
  completeProjectInputSchema,
  reviewDeliveryInputSchema,
  safeDeliveryUrlSchema,
  submitDeliveryInputSchema,
} from "./validation";

const acceptanceSnapshotSchema = z
  .array(
    z.object({
      description: z.string().min(1).max(specLimits.longTextLength),
      verificationMethod: z.string().min(1).max(specLimits.longTextLength),
    }),
  )
  .min(1)
  .max(specLimits.acceptanceCriteriaPerMilestone);

const storedLinksSchema = z.array(safeDeliveryUrlSchema).min(1).max(10);
const storedCriteriaResultsSchema = z
  .array(
    z
      .object({
        position: z.number().int().min(1).max(20),
        outcome: z.enum(["PASS", "FAIL"]),
      })
      .strict(),
  )
  .min(1)
  .max(20);

function toSubmittedDelivery(row: typeof submissions.$inferSelect): SubmittedDeliveryDTO {
  const links = storedLinksSchema.parse(row.links);
  return {
    id: row.id,
    sequence: row.sequence,
    summary: row.summary,
    links,
    createdAt: row.createdAt.toISOString(),
  };
}

type InsertedSubmissionRow = {
  id: string;
  sequence: number;
  summary: string;
  links: unknown;
  created_at: Date | string;
};

function toInsertedSubmission(row: InsertedSubmissionRow): SubmittedDeliveryDTO {
  const links = storedLinksSchema.parse(row.links);
  return {
    id: row.id,
    sequence: row.sequence,
    summary: row.summary,
    links,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function submitDeliveryWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<DeliveryMutationDTO> {
  assertActiveRole(actor, "BUILDER");
  const input = submitDeliveryInputSchema.parse(rawInput);

  return database.transaction(async (transaction) =>
    withProjectRowLock(
      transaction,
      input.projectId,
      { notFound: () => new DeliveryError("NOT_FOUND", "Project not found.") },
      async (project) => {
        if (!project.selectedApplicationId || !project.lockedSpecVersionId) {
          throw new DeliveryError("NOT_FOUND", "Project not found.");
        }
        const [application] = await transaction
          .select()
          .from(applications)
          .where(
            and(
              eq(applications.projectId, project.id),
              eq(applications.id, project.selectedApplicationId),
            ),
          )
          .limit(1)
          .for("update");
        if (
          !application ||
          application.builderId !== actor.id ||
          application.status !== "ENGAGED" ||
          application.specVersionId !== project.lockedSpecVersionId
        ) {
          throw new DeliveryError("NOT_FOUND", "Project not found.");
        }

        const [milestone] = await transaction
          .select()
          .from(milestones)
          .where(and(eq(milestones.projectId, project.id), eq(milestones.id, input.milestoneId)))
          .limit(1)
          .for("update");
        if (!milestone) throw new DeliveryError("NOT_FOUND", "Milestone not found.");

        const [replay] = await transaction
          .select()
          .from(submissions)
          .where(
            and(
              eq(submissions.projectId, project.id),
              eq(submissions.milestoneId, milestone.id),
              eq(submissions.builderId, actor.id),
              eq(submissions.submissionKey, input.submissionKey),
            ),
          )
          .limit(1);
        if (replay) {
          if (
            replay.summary === input.summary &&
            stableJson(replay.links) === stableJson(input.links)
          ) {
            return { submission: toSubmittedDelivery(replay), replayed: true };
          }
          throw new DeliveryError("CONFLICT", "该提交键已用于不同内容，请刷新后重试。");
        }

        if (project.status !== "IN_PROGRESS") {
          throw new DeliveryError("INVALID_STAGE", "当前项目或里程碑暂不接受新的成果提交。");
        }
        if (input.expectedCurrentSubmissionId !== milestone.currentSubmissionId) {
          throw new DeliveryError("CONFLICT", "当前交付轮次已变化，请刷新后再提交。");
        }
        if (
          (milestone.status !== "IN_PROGRESS" && milestone.status !== "REVISION") ||
          (milestone.status === "IN_PROGRESS" && milestone.currentSubmissionId !== null) ||
          (milestone.status === "REVISION" && milestone.currentSubmissionId === null)
        ) {
          throw new DeliveryError("INVALID_STAGE", "当前项目或里程碑暂不接受新的成果提交。");
        }

        const [maxSequence] = await transaction
          .select({ value: sql<number>`coalesce(max(${submissions.sequence}), 0)::int` })
          .from(submissions)
          .where(and(eq(submissions.projectId, project.id), eq(submissions.milestoneId, milestone.id)));
        const sequence = (maxSequence?.value ?? 0) + 1;
        const id = randomUUID();
        // Keep the INSERT column list explicit: runtime is not allowed to
        // override the database-owned history timestamp.
        const [inserted] = await transaction.execute<InsertedSubmissionRow>(sql`
          insert into app.submissions
            (id, project_id, milestone_id, builder_id, sequence, submission_key, summary, links)
          values (
            ${id}, ${project.id}, ${milestone.id}, ${actor.id}, ${sequence},
            ${input.submissionKey}, ${input.summary}, ${JSON.stringify(input.links)}::jsonb
          )
          returning id, sequence, summary, links, created_at
        `);
        if (!inserted) throw new Error("The new submission could not be read back.");

        const [updatedMilestone] = await transaction
          .update(milestones)
          .set({ currentSubmissionId: inserted.id, status: "IN_REVIEW" })
          .where(and(eq(milestones.projectId, project.id), eq(milestones.id, milestone.id)))
          .returning({ id: milestones.id });
        if (!updatedMilestone) throw new DeliveryError("INVALID_STAGE", "里程碑状态已变化，请刷新后重试。");

        await transaction
          .update(projects)
          .set({ version: sql`${projects.version} + 1`, updatedAt: new Date() })
          .where(eq(projects.id, project.id));

        return { submission: toInsertedSubmission(inserted), replayed: false };
      },
    ),
  );
}

export async function reviewDeliveryWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<ReviewMutationDTO> {
  assertActiveRole(actor, "ENTERPRISE");
  const input = reviewDeliveryInputSchema.parse(rawInput);

  return database.transaction(async (transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id },
      { notFound: () => new DeliveryError("NOT_FOUND", "Project not found.") },
      async (project) => {
        const [milestone] = await transaction
          .select()
          .from(milestones)
          .where(and(eq(milestones.projectId, project.id), eq(milestones.id, input.milestoneId)))
          .limit(1)
          .for("update");
        if (!milestone) throw new DeliveryError("NOT_FOUND", "Milestone not found.");

        const criteria = acceptanceSnapshotSchema.safeParse(milestone.acceptanceCriteria);
        if (!criteria.success) throw new DeliveryError("INVALID_STAGE", "验收快照不可用，请联系本地环境维护者。");
        const results = [...input.criteriaResults].sort((left, right) => left.position - right.position);
        if (
          results.length !== criteria.data.length ||
          results.some((result, index) => result.position !== index + 1) ||
          new Set(results.map((result) => result.position)).size !== results.length
        ) {
          throw new DeliveryError("INVALID_REVIEW", "验收结果必须恰好覆盖当前里程碑的全部验收标准。");
        }
        const allPass = results.every((result) => result.outcome === "PASS");
        const reason = input.reason?.trim() || null;
        if (allPass && reason) {
          throw new DeliveryError("INVALID_REVIEW", "全部通过时不应填写返工原因。");
        }
        if (!allPass && !reason) {
          throw new DeliveryError("INVALID_REVIEW", "存在未通过项时必须说明返工原因。");
        }
        const outcome: DeliveryReviewDTO["outcome"] = allPass ? "PASS" : "FAIL";
        const canonicalResults = results.map(({ position, outcome: result }) => ({ position, outcome: result }));
        const canonicalPayload = { outcome, criteriaResults: canonicalResults, reason };

        const [submission] = await transaction
          .select()
          .from(submissions)
          .where(
            and(
              eq(submissions.projectId, project.id),
              eq(submissions.milestoneId, milestone.id),
              eq(submissions.id, input.submissionId),
            ),
          )
          .limit(1);
        if (!submission) throw new DeliveryError("NOT_FOUND", "Submission not found.");

        const [existingReview] = await transaction
          .select()
          .from(submissionReviews)
          .where(eq(submissionReviews.submissionId, submission.id))
          .limit(1);
        if (existingReview) {
          const storedPayload = {
            outcome: existingReview.outcome,
            criteriaResults: storedCriteriaResultsSchema.parse(existingReview.criteriaResults),
            reason: existingReview.reason,
          };
          if (
            existingReview.reviewerId === actor.id &&
            stableJson(storedPayload) === stableJson(canonicalPayload)
          ) {
            return {
              submissionId: submission.id,
              outcome: existingReview.outcome as DeliveryReviewDTO["outcome"],
              replayed: true,
              projectStatus: project.status as ReviewMutationDTO["projectStatus"],
            };
          }
          throw new DeliveryError("CONFLICT", "该成果已经完成审核，不能用不同结果覆盖。");
        }

        if (
          project.status !== "IN_PROGRESS" ||
          milestone.status !== "IN_REVIEW" ||
          milestone.currentSubmissionId !== submission.id
        ) {
          throw new DeliveryError("INVALID_STAGE", "只能审核当前里程碑的最新待审成果。");
        }

        // Only the review payload columns are writable; created_at stays DB-owned.
        await transaction.execute(sql`
          insert into app.submission_reviews
            (id, project_id, milestone_id, submission_id, reviewer_id, outcome, criteria_results, reason)
          values (
            ${randomUUID()}, ${project.id}, ${milestone.id}, ${submission.id}, ${actor.id},
            ${outcome}, ${JSON.stringify(canonicalResults)}::jsonb, ${reason}
          )
        `);

        await transaction
          .update(milestones)
          .set({ status: allPass ? "APPROVED" : "REVISION" })
          .where(and(eq(milestones.projectId, project.id), eq(milestones.id, milestone.id)));

        let projectStatus: ReviewMutationDTO["projectStatus"] = "IN_PROGRESS";
        if (allPass) {
          const [next] = await transaction
            .select({ id: milestones.id })
            .from(milestones)
            .where(and(eq(milestones.projectId, project.id), eq(milestones.status, "PENDING")))
            .orderBy(asc(milestones.position))
            .limit(1)
            .for("update");
          if (next) {
            await transaction
              .update(milestones)
              .set({ status: "IN_PROGRESS" })
              .where(and(eq(milestones.projectId, project.id), eq(milestones.id, next.id)));
          } else {
            await transaction
              .update(projects)
              .set({
                status: "FINAL_REVIEW",
                version: sql`${projects.version} + 1`,
                updatedAt: new Date(),
              })
              .where(and(eq(projects.id, project.id), eq(projects.status, "IN_PROGRESS")));
            projectStatus = "FINAL_REVIEW";
          }
        }
        if (projectStatus === "IN_PROGRESS") {
          await transaction
            .update(projects)
            .set({ version: sql`${projects.version} + 1`, updatedAt: new Date() })
            .where(and(eq(projects.id, project.id), eq(projects.status, "IN_PROGRESS")));
        }

        return { submissionId: submission.id, outcome, replayed: false, projectStatus };
      },
    ),
  );
}

export async function completeProjectWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<CompletionDTO> {
  assertActiveRole(actor, "ENTERPRISE");
  const input = completeProjectInputSchema.parse(rawInput);

  return database.transaction(async (transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id },
      { notFound: () => new DeliveryError("NOT_FOUND", "Project not found.") },
      async (project) => {
        if (project.status === "COMPLETED" && project.completedAt) {
          return {
            projectId: project.id,
            status: "COMPLETED",
            completedAt: project.completedAt.toISOString(),
            replayed: true,
          };
        }
        if (project.status !== "FINAL_REVIEW") {
          throw new DeliveryError("INVALID_STAGE", "只有全部里程碑通过后，企业才能确认完成项目。");
        }

        const rows = await transaction
          .select({ id: milestones.id, status: milestones.status })
          .from(milestones)
          .where(eq(milestones.projectId, project.id))
          .orderBy(asc(milestones.position))
          .for("update");
        if (rows.length === 0 || rows.some((row) => row.status !== "APPROVED")) {
          throw new DeliveryError("INVALID_STAGE", "全部里程碑通过后，才能确认完成项目。");
        }

        const completedAt = new Date();
        const [completed] = await transaction
          .update(projects)
          .set({
            status: "COMPLETED",
            completedAt,
            version: sql`${projects.version} + 1`,
            updatedAt: completedAt,
          })
          .where(and(eq(projects.id, project.id), eq(projects.status, "FINAL_REVIEW")))
          .returning({ completedAt: projects.completedAt });
        if (!completed?.completedAt) throw new DeliveryError("INVALID_STAGE", "项目状态已变化，请刷新后重试。");
        return {
          projectId: project.id,
          status: "COMPLETED",
          completedAt: completed.completedAt.toISOString(),
          replayed: false,
        };
      },
    ),
  );
}
