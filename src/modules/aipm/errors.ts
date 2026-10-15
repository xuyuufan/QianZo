/**
 * Errors raised by the AIPM application service. Messages stay generic on
 * purpose: provider text, SQL errors and stack traces must never reach the UI.
 */
export type AipmErrorCode =
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "SPEC_LOCKED"
  | "MESSAGE_LIMIT_REACHED"
  | "PROVIDER_FAILED"
  | "INVALID_RESPONSE"
  | "CONTRACT_MISMATCH"
  | "MISSING_SPEC";

export class AipmError extends Error {
  constructor(
    public readonly code: AipmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AipmError";
  }
}
