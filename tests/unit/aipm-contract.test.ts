import { describe, expect, it } from "vitest";

import {
  AIPM_CONTRACT_VERSION,
  aipmLimits,
  aipmRequestSchema,
  parseAipmResponse,
  type AipmRequest,
} from "@/modules/aipm/contract";

import { userTranscript, validAipmRequest } from "../helpers/aipm-fixture";
import { validSpecDocument } from "../helpers/spec-fixture";

function successResponse(request: AipmRequest, overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: AIPM_CONTRACT_VERSION,
    invocationId: request.invocationId,
    status: "SUCCESS",
    result: {
      assistantMessage: "请继续补充验收标准。",
      completeness: { readyForReview: false, missingInformation: ["验收标准"] },
    },
    ...overrides,
  };
}

function errorCodeOf(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  throw new Error("Expected the call to throw.");
}

describe("AIPM request contract", () => {
  it("accepts a minimal request", () => {
    expect(aipmRequestSchema.safeParse(validAipmRequest()).success).toBe(true);
  });

  it("rejects an empty message and an undeclared field", () => {
    const empty = validAipmRequest({ messages: [{ role: "user", content: "" }] });
    expect(aipmRequestSchema.safeParse(empty).success).toBe(false);

    const extra = { ...validAipmRequest(), unexpected: true };
    expect(aipmRequestSchema.safeParse(extra).success).toBe(false);
  });

  it("rejects a message above the input limit", () => {
    const oversized = validAipmRequest({
      messages: [{ role: "user", content: "需".repeat(aipmLimits.userMessageLength + 1) }],
    });
    expect(aipmRequestSchema.safeParse(oversized).success).toBe(false);
  });

  it("rejects a transcript above the message limit", () => {
    const oversized = validAipmRequest({
      messages: userTranscript(aipmLimits.messagesPerRequest + 1),
    });
    expect(aipmRequestSchema.safeParse(oversized).success).toBe(false);
  });
});

describe("AIPM response validation", () => {
  it("accepts a correlated interview reply", () => {
    const request = validAipmRequest();
    const response = parseAipmResponse(request, successResponse(request));

    expect(response.status).toBe("SUCCESS");
  });

  it("accepts a FAILED response", () => {
    const request = validAipmRequest();
    const response = parseAipmResponse(request, {
      contractVersion: AIPM_CONTRACT_VERSION,
      invocationId: request.invocationId,
      status: "FAILED",
      error: { code: "UPSTREAM_TIMEOUT", message: "provider detail" },
    });

    expect(response.status).toBe("FAILED");
  });

  const correlationCases: Array<[string, Record<string, unknown>, string]> = [
    ["the wrong invocation id", { invocationId: "6d0d2b1e-6a9f-4a4f-9e3a-5a1b2c3d4e5f" }, "CONTRACT_MISMATCH"],
    ["the wrong contract version", { contractVersion: "2" }, "INVALID_RESPONSE"],
  ];

  it.each(correlationCases)("rejects a response with %s", (_label, override, expectedCode) => {
    const request = validAipmRequest();
    const code = errorCodeOf(() => parseAipmResponse(request, successResponse(request, override)));

    expect(code).toBe(expectedCode);
  });

  it("rejects a generation result without a spec proposal", () => {
    const request = validAipmRequest({ operation: "GENERATE_SPEC" });
    const code = errorCodeOf(() => parseAipmResponse(request, successResponse(request)));

    expect(code).toBe("MISSING_SPEC");
  });

  it("rejects an invalid spec proposal", () => {
    const request = validAipmRequest({ operation: "GENERATE_SPEC" });
    const response = successResponse(request, {
      result: {
        assistantMessage: "候选如下。",
        completeness: { readyForReview: true, missingInformation: [] },
        specProposal: { schemaVersion: 1, projectGoal: "" },
      },
    });

    expect(errorCodeOf(() => parseAipmResponse(request, response))).toBe("INVALID_RESPONSE");
  });

  it("accepts a valid generation result", () => {
    const request = validAipmRequest({ operation: "GENERATE_SPEC" });
    const response = successResponse(request, {
      result: {
        assistantMessage: "候选如下。",
        completeness: { readyForReview: true, missingInformation: [] },
        specProposal: validSpecDocument(),
      },
    });

    const parsed = parseAipmResponse(request, response);
    expect(parsed.status).toBe("SUCCESS");
    if (parsed.status === "SUCCESS") {
      expect(parsed.result.specProposal?.milestones).toHaveLength(2);
    }
  });

  const invalidPayloadCases: Array<[string, unknown]> = [
    ["a non-object payload", "not-a-response"],
    ["an oversized payload", { padding: "x".repeat(aipmLimits.serializedResponseLength) }],
  ];

  it.each(invalidPayloadCases)("rejects %s", (_label, payload) => {
    const request = validAipmRequest();
    expect(errorCodeOf(() => parseAipmResponse(request, payload))).toBe("INVALID_RESPONSE");
  });
});
