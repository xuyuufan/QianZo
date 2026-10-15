/**
 * Errors raised by the mock payment service. Messages stay generic: no provider
 * text and no SQL details reach the UI.
 */
export type PaymentErrorCode = "NOT_FOUND" | "SPEC_LOCKED" | "INVALID_STAGE" | "PAYMENT_REQUIRED";

export class PaymentError extends Error {
  constructor(
    public readonly code: PaymentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}
