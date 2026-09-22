import { z } from "zod";

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
