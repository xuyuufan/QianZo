export type ApplicationActionState = {
  errorCode: string | null;
  message: string | null;
  successMessage: string | null;
  issues: string[];
};

export const emptyApplicationActionState: ApplicationActionState = {
  errorCode: null,
  message: null,
  successMessage: null,
  issues: [],
};
