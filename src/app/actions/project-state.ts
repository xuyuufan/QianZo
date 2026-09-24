export type ProjectActionState = {
  errorCode: string | null;
  message: string | null;
  /**
   * Success text rendered with the success style, mirroring `SpecActionState`
   * and `PaymentActionState`. Kept separate from `message` so a success is never
   * shown as an error (the budget form keeps using `message` with a null
   * `errorCode`, which it already styles as success).
   */
  successMessage: string | null;
  /** Field-level messages, e.g. from the budget input validation. */
  issues: string[];
};

export const emptyProjectActionState: ProjectActionState = {
  errorCode: null,
  message: null,
  successMessage: null,
  issues: [],
};
