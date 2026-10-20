import type { AipmRequest, AipmResponse } from "./contract";

/**
 * The platform team owns Provider integration behind this small module
 * boundary. S1 runs the in-process mock; a future Provider may use HTTP without
 * changing callers. `simulatePaymentSuccess`-style mock-only helpers stay
 * outside this interface.
 */
export interface AipmGateway {
  invoke(request: AipmRequest): Promise<AipmResponse>;
}
