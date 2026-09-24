/**
 * Errors raised by the project service. Messages stay generic: no raw SQL, no
 * provider text and no stack traces reach the UI.
 */
export type ProjectErrorCode =
  | "NOT_FOUND"
  | "CREATE_CONFLICT"
  | "VERSION_CONFLICT"
  | "SPEC_LOCKED"
  | "INVALID_SOURCE"
  | "INVALID_PREVIEW"
  | "PUBLISH_CONFLICT"
  | "INVALID_STAGE";

export class ProjectError extends Error {
  constructor(
    public readonly code: ProjectErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectError";
  }
}
