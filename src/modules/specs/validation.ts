import { z } from "zod";

import { specDocumentSchema } from "./document";

export const specVersionIdSchema = z.uuid();

export const adoptSpecProposalInputSchema = z
  .object({
    projectId: z.uuid(),
    sourceMessageId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
  })
  .strict();

export const saveSpecVersionInputSchema = z
  .object({
    projectId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
    document: specDocumentSchema,
  })
  .strict();

export type AdoptSpecProposalInput = z.infer<typeof adoptSpecProposalInputSchema>;
export type SaveSpecVersionInput = z.infer<typeof saveSpecVersionInputSchema>;
