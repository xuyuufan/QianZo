import { randomUUID } from "node:crypto";

import { parseAipmResponse, type AipmRequest } from "./contract";
import { AipmError } from "./errors";
import type { AipmGateway } from "./gateway";
import {
  beginAipmInvocationWithDatabase,
  completeAipmInvocationWithDatabase,
  type CompletedAipmInvocation,
} from "./repository";
import { interviewTurnInputSchema } from "./validation";

import type { Actor } from "@/modules/identity/onboarding";
import type { Database } from "@/platform/db/client";

/**
 * Application service for one AIPM turn: validate input, record the user message
 * inside a short transaction, call the gateway *outside* any transaction, then
 * validate and record the answer in a second short transaction. No transparent
 * retries: a failure keeps the user message and asks for an explicit retry.
 *
 * The module is free of the server-only boundary so integration tests can drive
 * the real flow with a real database.
 */
export async function invokeAipmWithDatabase(
  database: Database,
  actor: Actor,
  gateway: AipmGateway,
  rawInput: unknown,
  options: { invocationId?: string } = {},
): Promise<CompletedAipmInvocation> {
  const input = interviewTurnInputSchema.parse(rawInput);
  const invocationId = options.invocationId ?? randomUUID();

  const prepared = await beginAipmInvocationWithDatabase(database, actor, input, invocationId);
  const rawResponse = await callGateway(gateway, prepared.request);
  const response = parseAipmResponse(prepared.request, rawResponse);

  if (response.status === "FAILED") {
    throw new AipmError("PROVIDER_FAILED", "The AIPM provider did not return a usable result.");
  }

  return completeAipmInvocationWithDatabase(database, actor, {
    projectId: input.projectId,
    sessionId: prepared.sessionId,
    operation: input.operation,
    baseProjectVersion: prepared.baseProjectVersion,
    baseSpecVersionId: prepared.request.baseSpec?.versionId ?? null,
    response,
  });
}

async function callGateway(gateway: AipmGateway, request: AipmRequest): Promise<unknown> {
  try {
    return await gateway.invoke(request);
  } catch (error) {
    if (error instanceof AipmError) {
      throw error;
    }
    // Provider error text stays out of the platform and out of the UI.
    throw new AipmError("PROVIDER_FAILED", "The AIPM provider call failed.");
  }
}
