import type { PaymentStatus } from "@/platform/db/schema";

export type BuilderDepositPaymentDTO = {
  id: string;
  status: PaymentStatus;
  amountMinor: 100;
  currency: "CNY";
};

export type BuilderDepositDTO = {
  projectId: string;
  applicationId: string;
  payment: BuilderDepositPaymentDTO | null;
};
