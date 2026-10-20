import { z } from "zod";

export const applyToProjectInputSchema = z
  .object({
    projectId: z.uuid(),
    statement: z.string().trim().min(1).max(2000),
  })
  .strict();

export const getProjectApplicationsInputSchema = z.object({ projectId: z.uuid() }).strict();

export const selectApplicationInputSchema = z
  .object({
    projectId: z.uuid(),
    applicationId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
  })
  .strict();

export type ApplyToProjectInput = z.infer<typeof applyToProjectInputSchema>;
export type SelectApplicationInput = z.infer<typeof selectApplicationInputSchema>;
