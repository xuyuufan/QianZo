import type { PaymentProvider } from "./provider";

/**
 * The local slices run the in-process mock: creating a payment has no side effect outside the
 * platform database, and no provider reference is stored (a provider payment id
 * belongs to the real-payment contract, which this slice does not build).
 */
export const mockPaymentProvider: PaymentProvider = {
  async createPayment() {
    return undefined;
  },
};

/**
 * Server-side fixture for the local demo. It is a fixed demonstration amount,
 * not a deposit policy: it is not derived from the reference budget, and it says
 * nothing about real deposits, prepayments or platform fees.
 */
export const enterpriseDeposit = {
  purpose: "ENTERPRISE_DEPOSIT",
  amountMinor: 100,
  currency: "CNY",
} as const;

/** Fixed local demonstration amount for the selected Builder; not a product price. */
export const builderDeposit = {
  purpose: "BUILDER_DEPOSIT",
  amountMinor: 100,
  currency: "CNY",
} as const;
