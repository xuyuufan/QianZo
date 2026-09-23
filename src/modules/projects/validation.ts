import { z } from "zod";

import { DEMO_CURRENCY, parseMinorUnits } from "./money";

export const projectIdSchema = z.uuid();

export const createProjectInputSchema = z
  .object({
    projectId: projectIdSchema,
    title: z.string().trim().min(1).max(120),
    originalRequirement: z.string().max(10_000),
  })
  .strict();

export const updateProjectInputSchema = z
  .object({
    projectId: projectIdSchema,
    expectedVersion: z.coerce.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    originalRequirement: z.string().max(10_000),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

/**
 * Budget input arrives as text so the exact amount is parsed from digits instead
 * of a float; field-level issues are returned to the form.
 */
export const saveReferenceBudgetInputSchema = z
  .object({
    projectId: projectIdSchema,
    expectedVersion: z.coerce.number().int().positive(),
    minAmount: z.string().trim().min(1).max(20),
    maxAmount: z.string().trim().min(1).max(20),
  })
  .strict()
  .superRefine((input, context) => {
    const min = parseMinorUnits(input.minAmount, DEMO_CURRENCY);
    const max = parseMinorUnits(input.maxAmount, DEMO_CURRENCY);

    if (min === null) {
      context.addIssue({
        code: "custom",
        path: ["minAmount"],
        message: "预算下限必须是不超过两位小数的非负金额。",
      });
    }
    if (max === null) {
      context.addIssue({
        code: "custom",
        path: ["maxAmount"],
        message: "预算上限必须是不超过两位小数的非负金额。",
      });
    }
    if (min !== null && max !== null && max < min) {
      context.addIssue({
        code: "custom",
        path: ["maxAmount"],
        message: "预算上限不能低于预算下限。",
      });
    }
  })
  .transform((input) => ({
    projectId: input.projectId,
    expectedVersion: input.expectedVersion,
    minMinor: parseMinorUnits(input.minAmount, DEMO_CURRENCY) ?? 0,
    maxMinor: parseMinorUnits(input.maxAmount, DEMO_CURRENCY) ?? 0,
    currency: DEMO_CURRENCY,
  }));

export type SaveReferenceBudgetInput = z.infer<typeof saveReferenceBudgetInputSchema>;
