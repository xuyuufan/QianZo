export type AipmActionState = {
  errorCode: string | null;
  message: string | null;
  successMessage: string | null;
};

export const emptyAipmActionState: AipmActionState = {
  errorCode: null,
  message: null,
  successMessage: null,
};
