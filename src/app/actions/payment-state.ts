export type PaymentActionState = {
  errorCode: string | null;
  message: string | null;
  successMessage: string | null;
};

export const emptyPaymentActionState: PaymentActionState = {
  errorCode: null,
  message: null,
  successMessage: null,
};
