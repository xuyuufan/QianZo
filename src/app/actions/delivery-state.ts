export type DeliveryActionState = {
  errorCode: string | null;
  message: string | null;
  successMessage: string | null;
  issues: string[];
};

export const initialDeliveryActionState: DeliveryActionState = {
  errorCode: null,
  message: null,
  successMessage: null,
  issues: [],
};
