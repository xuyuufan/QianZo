import { z } from "zod";

import { specDocumentSchema } from "@/modules/specs/document";

import { AipmError } from "./errors";

/**
 * Shared AIPM contract (blueprint section 6): the HTTP protocol is fixed even
 * though S1 calls the in-process mock. Both directions are validated with the
 * same schemas so a real adapter cannot hand the platform an unchecked payload.
 */

export const AIPM_CONTRACT_VERSION = "1";

export const aipmLimits = {
  /** Caps the messages in a single request transcript. */
  messagesPerRequest: 40,
  /**
   * Caps the total rows stored for one interview session (USER + ASSISTANT).
   * Separate from `messagesPerRequest` on purpose: a request transcript and the
   * persisted session are different things, so the two limits must not drift.
   */
  sessionMessages: 40,
  userMessageLength: 4_000,
  instructionLength: 2_000,
  assistantMessageLength: 8_000,
  missingInformationItems: 20,
  missingInformationLength: 300,
  errorCodeLength: 80,
  errorMessageLength: 500,
  serializedResponseLength: 200_000,
} as const;

const aipmOperationSchema = z.enum(["INTERVIEW", "GENERATE_SPEC"]);

const transcriptMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(aipmLimits.userMessageLength),
  })
  .strict();

const completenessSchema = z
  .object({
    readyForReview: z.boolean(),
    missingInformation: z
      .array(z.string().trim().min(1).max(aipmLimits.missingInformationLength))
      .max(aipmLimits.missingInformationItems),
  })
  .strict();

const specProposalResultSchema = z
  .object({
    assistantMessage: z.string().trim().min(1).max(aipmLimits.assistantMessageLength),
    completeness: completenessSchema,
    specProposal: specDocumentSchema.optional(),
  })
  .strict();

export const aipmRequestSchema = z
  .object({
    contractVersion: z.literal(AIPM_CONTRACT_VERSION),
    invocationId: z.uuid(),
    operation: aipmOperationSchema,
    project: z
      .object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(120),
        originalRequirement: z.string().max(10_000),
      })
      .strict(),
    sessionId: z.uuid(),
    messages: z.array(transcriptMessageSchema).max(aipmLimits.messagesPerRequest),
    baseSpec: z
      .object({
        versionId: z.uuid(),
        document: specDocumentSchema,
      })
      .strict()
      .nullable(),
    instruction: z.string().trim().min(1).max(aipmLimits.instructionLength).optional(),
  })
  .strict();

export const aipmResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      contractVersion: z.literal(AIPM_CONTRACT_VERSION),
      invocationId: z.uuid(),
      status: z.literal("SUCCESS"),
      result: specProposalResultSchema,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(AIPM_CONTRACT_VERSION),
      invocationId: z.uuid(),
      status: z.literal("FAILED"),
      error: z
        .object({
          code: z.string().trim().min(1).max(aipmLimits.errorCodeLength),
          message: z.string().trim().min(1).max(aipmLimits.errorMessageLength),
        })
        .strict(),
    })
    .strict(),
]);

const aipmMessagePayloadSchema = z
  .object({
    invocationId: z.uuid(),
    contractVersion: z.literal(AIPM_CONTRACT_VERSION),
    operation: aipmOperationSchema,
    /** Project.version the request was assembled from, recorded by the platform. */
    generatedFromProjectVersion: z.number().int().positive(),
    baseSpecVersionId: z.uuid().nullable(),
    /**
     * Project.version at which this candidate may be adopted. `null` marks a
     * candidate that was already stale when the response landed.
     */
    adoptableProjectVersion: z.number().int().positive().nullable(),
    result: specProposalResultSchema,
  })
  .strict();

export type AipmOperation = z.infer<typeof aipmOperationSchema>;
export type AipmRequest = z.infer<typeof aipmRequestSchema>;
export type AipmResponse = z.infer<typeof aipmResponseSchema>;
export type AipmSuccessResponse = Extract<AipmResponse, { status: "SUCCESS" }>;
export type AipmMessagePayload = z.infer<typeof aipmMessagePayloadSchema>;

export const aipmPayloadSchema = aipmMessagePayloadSchema;

/**
 * Treats every provider answer as untrusted input: shape, contract version and
 * invocation correlation are verified before the platform records anything.
 */
export function parseAipmResponse(request: AipmRequest, rawResponse: unknown): AipmResponse {
  if (!hasAcceptableSize(rawResponse)) {
    throw new AipmError("INVALID_RESPONSE", "The AIPM response exceeded the accepted size.");
  }

  const response = aipmResponseSchema.safeParse(rawResponse);
  if (!response.success) {
    throw new AipmError("INVALID_RESPONSE", "The AIPM response did not match the contract.");
  }

  // Both directions use `z.literal(AIPM_CONTRACT_VERSION)`, so a response with a
  // different contract version already failed schema parsing above; there is no
  // separate version comparison to run here. Only the correlation id is left.
  if (response.data.invocationId !== request.invocationId) {
    throw new AipmError("CONTRACT_MISMATCH", "The AIPM response did not match the invocation.");
  }
  if (
    response.data.status === "SUCCESS" &&
    request.operation === "GENERATE_SPEC" &&
    !response.data.result.specProposal
  ) {
    throw new AipmError("MISSING_SPEC", "The generation result did not include a spec proposal.");
  }

  return response.data;
}

function hasAcceptableSize(rawResponse: unknown) {
  try {
    const serialized = JSON.stringify(rawResponse);
    return typeof serialized === "string" && serialized.length <= aipmLimits.serializedResponseLength;
  } catch {
    // Circular or otherwise unserializable payloads cannot be a valid response.
    return false;
  }
}
