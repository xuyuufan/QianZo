import { z } from "zod";

import { aipmLimits } from "./contract";

export const interviewTurnInputSchema = z
  .object({
    projectId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
    operation: z.enum(["INTERVIEW", "GENERATE_SPEC"]),
    message: z.string().trim().min(1).max(aipmLimits.userMessageLength),
    instruction: z.string().trim().max(aipmLimits.instructionLength).optional(),
  })
  .strict();

export type InterviewTurnInput = z.infer<typeof interviewTurnInputSchema>;
