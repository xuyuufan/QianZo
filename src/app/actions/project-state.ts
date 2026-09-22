export type ProjectActionState = {
  errorCode: string | null;
  message: string | null;
};

export const emptyProjectActionState: ProjectActionState = { errorCode: null, message: null };
