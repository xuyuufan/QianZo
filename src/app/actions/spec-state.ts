export type SpecActionState = {
  errorCode: string | null;
  message: string | null;
  successMessage: string | null;
  /** Field-level messages from the shared SpecDocumentV1 validator. */
  issues: string[];
};

export const emptySpecActionState: SpecActionState = {
  errorCode: null,
  message: null,
  successMessage: null,
  issues: [],
};
