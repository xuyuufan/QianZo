/**
 * Errors raised by the spec review service. Messages stay generic: no raw SQL,
 * no provider text and no stack traces reach the UI.
 */
export type SpecErrorCode =
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "SPEC_LOCKED"
  | "INVALID_PROPOSAL"
  | "STALE_PROPOSAL"
  | "INVALID_DOCUMENT";

export class SpecError extends Error {
  constructor(
    public readonly code: SpecErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SpecError";
  }
}
