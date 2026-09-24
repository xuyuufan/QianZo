import { z } from "zod";

export const createEnterpriseDepositInputSchema = z
  .object({
    projectId: z.uuid(),
  })
  .strict();

/**
 * The deposit is reached from one project's page, so the project is part of the
 * intent: binding it here stops an owner of two projects from confirming one
 * project's pending deposit through the other project's action.
 */
export const simulatePaymentSuccessInputSchema = z
  .object({
    projectId: z.uuid(),
    paymentId: z.uuid(),
  })
  .strict();

export type CreateEnterpriseDepositInput = z.infer<typeof createEnterpriseDepositInputSchema>;
export type SimulatePaymentSuccessInput = z.infer<typeof simulatePaymentSuccessInputSchema>;
