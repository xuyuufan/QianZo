import { z } from "zod";

/**
 * Shared SpecDocumentV1 schema (blueprint appendix A) plus the semantic rules
 * that a database CHECK cannot express: referenced ids must exist, element ids
 * must be unique and stable, every milestone needs at least one acceptance
 * criterion, and dueAfterDays must be a strictly increasing positive integer.
 *
 * This module is pure so that the same validator serves the mock gateway, the
 * review UI and the tests. It deliberately does not import server-only code.
 */

export const SPEC_SCHEMA_VERSION = 1;

export const specLimits = {
  identifierLength: 64,
  shortTextLength: 200,
  longTextLength: 2_000,
  listLength: 50,
  milestoneCount: 20,
  acceptanceCriteriaPerMilestone: 20,
  dueAfterDays: 3_650,
} as const;

const elementIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(specLimits.identifierLength)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "元素 ID 只能使用字母、数字、点、下划线和短横线，并且必须以字母或数字开头。",
  );

const shortTextSchema = z.string().trim().min(1).max(specLimits.shortTextLength);
const longTextSchema = z.string().trim().min(1).max(specLimits.longTextLength);
const optionalLongTextSchema = z.string().trim().max(specLimits.longTextLength);

const referenceIdsSchema = z
  .array(elementIdSchema)
  .max(specLimits.listLength)
  .refine((ids) => new Set(ids).size === ids.length, "引用列表不能包含重复 ID。");

const userRoleSchema = z
  .object({
    id: elementIdSchema,
    name: shortTextSchema,
    description: longTextSchema,
  })
  .strict();

const featureSchema = z
  .object({
    id: elementIdSchema,
    title: shortTextSchema,
    description: longTextSchema,
    userRoleIds: referenceIdsSchema,
  })
  .strict();

const pageSchema = z
  .object({
    id: elementIdSchema,
    name: shortTextSchema,
    purpose: longTextSchema,
    featureIds: referenceIdsSchema,
  })
  .strict();

const userFlowSchema = z
  .object({
    id: elementIdSchema,
    name: shortTextSchema,
    steps: z.array(longTextSchema).min(1).max(specLimits.listLength),
  })
  .strict();

const integrationSchema = z
  .object({
    id: elementIdSchema,
    name: shortTextSchema,
    purpose: longTextSchema,
    constraints: longTextSchema,
  })
  .strict();

const deliverableSchema = z
  .object({
    id: elementIdSchema,
    title: shortTextSchema,
    description: longTextSchema,
  })
  .strict();

const acceptanceCriterionSchema = z
  .object({
    id: elementIdSchema,
    description: longTextSchema,
    verificationMethod: longTextSchema,
  })
  .strict();

const milestoneSchema = z
  .object({
    id: elementIdSchema,
    title: shortTextSchema,
    description: longTextSchema,
    dueAfterDays: z.number().int().positive().max(specLimits.dueAfterDays),
    deliverableIds: referenceIdsSchema,
    // At least one acceptance criterion: a milestone without one cannot be verified.
    acceptanceCriteria: z
      .array(acceptanceCriterionSchema)
      .min(1)
      .max(specLimits.acceptanceCriteriaPerMilestone),
  })
  .strict();

const baseSpecDocumentSchema = z
  .object({
    schemaVersion: z.literal(SPEC_SCHEMA_VERSION),
    projectGoal: longTextSchema,
    background: optionalLongTextSchema,
    userRoles: z.array(userRoleSchema).min(1).max(specLimits.listLength),
    features: z.array(featureSchema).min(1).max(specLimits.listLength),
    pages: z.array(pageSchema).max(specLimits.listLength),
    userFlows: z.array(userFlowSchema).max(specLimits.listLength),
    integrations: z.array(integrationSchema).max(specLimits.listLength),
    technicalConstraints: z.array(longTextSchema).max(specLimits.listLength),
    deliverables: z.array(deliverableSchema).min(1).max(specLimits.listLength),
    milestones: z.array(milestoneSchema).min(1).max(specLimits.milestoneCount),
    outOfScope: z.array(longTextSchema).max(specLimits.listLength),
    assumptions: z.array(longTextSchema).max(specLimits.listLength),
  })
  .strict();

export const specDocumentSchema = baseSpecDocumentSchema.superRefine((document, context) => {
  const seenIds = new Map<string, string>();

  const registerId = (id: string, path: (string | number)[]) => {
    const location = path.join(".");
    const previous = seenIds.get(id);
    if (previous) {
      context.addIssue({
        code: "custom",
        path,
        message: `元素 ID "${id}" 重复，已出现在 ${previous}。结构化元素 ID 必须全局唯一且稳定。`,
      });
      return;
    }
    seenIds.set(id, location);
  };

  const userRoleIds = new Set<string>();
  document.userRoles.forEach((role, index) => {
    userRoleIds.add(role.id);
    registerId(role.id, ["userRoles", index]);
  });

  const featureIds = new Set<string>();
  document.features.forEach((feature, index) => {
    featureIds.add(feature.id);
    registerId(feature.id, ["features", index]);
    feature.userRoleIds.forEach((reference) => {
      if (!userRoleIds.has(reference)) {
        context.addIssue({
          code: "custom",
          path: ["features", index, "userRoleIds"],
          message: `功能 "${feature.id}" 引用了不存在的使用者角色 "${reference}"。`,
        });
      }
    });
  });

  document.pages.forEach((page, index) => {
    registerId(page.id, ["pages", index]);
    page.featureIds.forEach((reference) => {
      if (!featureIds.has(reference)) {
        context.addIssue({
          code: "custom",
          path: ["pages", index, "featureIds"],
          message: `页面 "${page.id}" 引用了不存在的功能 "${reference}"。`,
        });
      }
    });
  });

  document.userFlows.forEach((flow, index) => {
    registerId(flow.id, ["userFlows", index]);
  });

  document.integrations.forEach((integration, index) => {
    registerId(integration.id, ["integrations", index]);
  });

  const deliverableIds = new Set<string>();
  document.deliverables.forEach((deliverable, index) => {
    deliverableIds.add(deliverable.id);
    registerId(deliverable.id, ["deliverables", index]);
  });

  let previousDueAfterDays = 0;
  document.milestones.forEach((milestone, index) => {
    registerId(milestone.id, ["milestones", index]);
    milestone.deliverableIds.forEach((reference) => {
      if (!deliverableIds.has(reference)) {
        context.addIssue({
          code: "custom",
          path: ["milestones", index, "deliverableIds"],
          message: `里程碑 "${milestone.id}" 引用了不存在的交付物 "${reference}"。`,
        });
      }
    });
    if (milestone.dueAfterDays <= previousDueAfterDays) {
      context.addIssue({
        code: "custom",
        path: ["milestones", index, "dueAfterDays"],
        message:
          "dueAfterDays 必须是严格递增的正整数，里程碑按文档顺序执行（相对开工时间的累计自然日）。",
      });
    }
    previousDueAfterDays = Math.max(previousDueAfterDays, milestone.dueAfterDays);
    milestone.acceptanceCriteria.forEach((criterion, criterionIndex) => {
      registerId(criterion.id, ["milestones", index, "acceptanceCriteria", criterionIndex]);
    });
  });
});

export type SpecDocumentV1 = z.infer<typeof specDocumentSchema>;
export type SpecMilestone = SpecDocumentV1["milestones"][number];
export type SpecAcceptanceCriterion = SpecMilestone["acceptanceCriteria"][number];

/** Total natural days from kickoff, taken from the last milestone in document order. */
export function specDeliveryDays(document: SpecDocumentV1): number {
  const lastMilestone = document.milestones[document.milestones.length - 1];
  return lastMilestone.dueAfterDays;
}

export function parseSpecDocument(raw: unknown): SpecDocumentV1 {
  return specDocumentSchema.parse(raw);
}

export function safeParseSpecDocument(raw: unknown) {
  return specDocumentSchema.safeParse(raw);
}

/** Field-level messages for the review UI, e.g. `milestones.0.dueAfterDays: ...`. */
export function describeSpecIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
