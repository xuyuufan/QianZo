export type ApplicationErrorCode =
  | "NOT_FOUND"
  | "ALREADY_APPLIED"
  | "ALREADY_SELECTED"
  | "VERSION_CONFLICT"
  | "INVALID_STAGE"
  | "CANNOT_APPLY_TO_OWN_PROJECT";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
