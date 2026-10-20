import { z } from "zod";

import { describeAmount, describeBudget } from "@/modules/projects/money";
import { specDeliveryDays, specDocumentSchema, type SpecDocumentV1 } from "@/modules/specs/document";

/**
 * The published snapshot is the only thing the recruitment view reads. It is
 * built as a whitelist: no original requirement, no interview transcript, no
 * message payload, no account data and no payment details can end up here.
 */
export const recruitmentSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Internal provenance; the recruitment DTOs never expose it. */
    lockedSpecVersionId: z.uuid(),
    title: z.string().trim().min(1).max(120),
    budget: z
      .object({
        minMinor: z.number().int().nonnegative(),
        maxMinor: z.number().int().nonnegative(),
        currency: z.string().length(3),
      })
      .strict(),
    document: specDocumentSchema,
  })
  .strict();

export type RecruitmentSnapshot = z.infer<typeof recruitmentSnapshotSchema>;

/** White-list DTO for the recruitment list. */
export type RecruitmentSummary = {
  projectId: string;
  title: string;
  goal: string;
  budgetLabel: string;
  deliveryDays: number;
  milestoneCount: number;
  publishedAt: Date;
};

/** White-list DTO for one published project. */
export type RecruitmentDetail = {
  projectId: string;
  title: string;
  document: SpecDocumentV1;
  budgetLabel: string;
  deliveryDays: number;
  publishedAt: Date;
  /** Safe viewer capability; does not expose project ownership. */
  canApply: boolean;
};

export function buildRecruitmentSnapshot(params: {
  lockedSpecVersionId: string;
  title: string;
  budgetMinMinor: number;
  budgetMaxMinor: number;
  currency: string;
  document: SpecDocumentV1;
}): RecruitmentSnapshot {
  return recruitmentSnapshotSchema.parse({
    schemaVersion: 1,
    lockedSpecVersionId: params.lockedSpecVersionId,
    title: params.title,
    budget: {
      minMinor: params.budgetMinMinor,
      maxMinor: params.budgetMaxMinor,
      currency: params.currency,
    },
    document: params.document,
  });
}

export function parseRecruitmentSnapshot(raw: unknown): RecruitmentSnapshot | null {
  const parsed = recruitmentSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function toRecruitmentSummary(
  projectId: string,
  publishedAt: Date,
  snapshot: RecruitmentSnapshot,
): RecruitmentSummary {
  return {
    projectId,
    title: snapshot.title,
    goal: snapshot.document.projectGoal,
    budgetLabel: describeRecruitmentBudget(snapshot),
    deliveryDays: specDeliveryDays(snapshot.document),
    milestoneCount: snapshot.document.milestones.length,
    publishedAt,
  };
}

export function toRecruitmentDetail(
  projectId: string,
  publishedAt: Date,
  snapshot: RecruitmentSnapshot,
  canApply: boolean,
): RecruitmentDetail {
  return {
    projectId,
    title: snapshot.title,
    document: snapshot.document,
    budgetLabel: describeRecruitmentBudget(snapshot),
    deliveryDays: specDeliveryDays(snapshot.document),
    publishedAt,
    canApply,
  };
}

/** Reference budget with the "not a contract price" context in one string. */
export function describeRecruitmentBudget(snapshot: RecruitmentSnapshot): string {
  const range = describeBudget(
    snapshot.budget.minMinor,
    snapshot.budget.maxMinor,
    snapshot.budget.currency,
  );
  return range ?? describeAmount(0, snapshot.budget.currency);
}

/**
 * Order-independent JSON, used to recognise "the same published result" on a
 * repeated publish intent.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
