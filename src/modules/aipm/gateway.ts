import type { AipmRequest, AipmResponse } from "./contract";

/**
 * The platform keeps the smallest provider-facing interface. S1 runs the
 * in-process mock; a real HTTP adapter replaces the implementation without
 * changing the callers, and `simulatePaymentSuccess`-style mock-only helpers
 * stay outside this interface.
 */
export interface AipmGateway {
  invoke(request: AipmRequest): Promise<AipmResponse>;
}
