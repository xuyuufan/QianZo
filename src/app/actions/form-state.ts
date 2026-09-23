export type FormActionState = {
  errorCode: string | null;
  message: string | null;
};

export const emptyFormActionState: FormActionState = { errorCode: null, message: null };
