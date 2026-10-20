import type { PaymentPurpose } from "@/platform/db/schema";

/**
 * The smallest provider-facing contract: S1 only needs the ability to create a
 * mock payment creation. `simulatePaymentSuccess` is deliberately not part of it, because
 * a real provider would never implement "simulate success".
 */
export type PaymentCreationRequest = {
  paymentId: string;
  projectId: string;
  payerId: string;
  purpose: PaymentPurpose;
  amountMinor: number;
  currency: string;
};

export interface PaymentProvider {
  createPayment(request: PaymentCreationRequest): Promise<void>;
}
