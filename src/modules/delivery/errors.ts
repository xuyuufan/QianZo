export type DeliveryErrorCode =
  | "NOT_FOUND"
  | "INVALID_STAGE"
  | "CONFLICT"
  | "INVALID_REVIEW";

export class DeliveryError extends Error {
  constructor(
    public readonly code: DeliveryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}
