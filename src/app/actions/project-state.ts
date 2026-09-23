export type ProjectActionState = {
  errorCode: string | null;
  message: string | null;
  /** Field-level messages, e.g. from the budget input validation. */
  issues: string[];
};

export const emptyProjectActionState: ProjectActionState = {
  errorCode: null,
  message: null,
  issues: [],
};
