import { z } from "zod";

export const createEnterpriseDepositInputSchema = z
  .object({
    projectId: z.uuid(),
  })
  .strict();

export const simulatePaymentSuccessInputSchema = z
  .object({
    paymentId: z.uuid(),
  })
  .strict();

export type CreateEnterpriseDepositInput = z.infer<typeof createEnterpriseDepositInputSchema>;
export type SimulatePaymentSuccessInput = z.infer<typeof simulatePaymentSuccessInputSchema>;
