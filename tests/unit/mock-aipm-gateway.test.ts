import { describe, expect, it } from "vitest";

import { createMockAipmGateway } from "@/modules/aipm/mock-gateway";
import { safeParseSpecDocument } from "@/modules/specs/document";

import { userTranscript, validAipmRequest } from "../helpers/aipm-fixture";

describe("MockAipmGateway", () => {
  it("returns the same answer for the same request", async () => {
    const gateway = createMockAipmGateway();
    const request = validAipmRequest({ messages: userTranscript(2) });

    expect(await gateway.invoke(request)).toEqual(await gateway.invoke(request));
  });

  it("asks one question per interview turn and reports when information is sufficient", async () => {
    const gateway = createMockAipmGateway();

    const first = await gateway.invoke(validAipmRequest());
    const fifth = await gateway.invoke(validAipmRequest({ messages: userTranscript(5) }));

    expect(first.status).toBe("SUCCESS");
    expect(fifth.status).toBe("SUCCESS");
    if (first.status === "SUCCESS" && fifth.status === "SUCCESS") {
      expect(first.result.completeness.readyForReview).toBe(false);
      expect(first.result.assistantMessage).not.toBe(fifth.result.assistantMessage);
      expect(fifth.result.completeness).toEqual({ readyForReview: true, missingInformation: [] });
      expect(first.result.specProposal).toBeUndefined();
    }
  });

  it("produces a structurally valid spec proposal for a generation request", async () => {
    const gateway = createMockAipmGateway();
    const response = await gateway.invoke(
      validAipmRequest({ operation: "GENERATE_SPEC", messages: userTranscript(4) }),
    );

    expect(response.status).toBe("SUCCESS");
    if (response.status === "SUCCESS") {
      expect(response.result.specProposal).toBeDefined();
      expect(safeParseSpecDocument(response.result.specProposal).success).toBe(true);
    }
  });

  it("can inject a FAILED answer", async () => {
    const gateway = createMockAipmGateway({ failWith: { code: "UPSTREAM", message: "boom" } });
    const response = await gateway.invoke(validAipmRequest({ operation: "GENERATE_SPEC" }));

    expect(response.status).toBe("FAILED");
    if (response.status === "FAILED") {
      expect(response.error.code).toBe("UPSTREAM");
    }
  });

  it("can inject a generation result without a proposal", async () => {
    const gateway = createMockAipmGateway({ omitSpecProposal: true });
    const response = await gateway.invoke(validAipmRequest({ operation: "GENERATE_SPEC" }));

    expect(response.status).toBe("SUCCESS");
    if (response.status === "SUCCESS") {
      expect(response.result.specProposal).toBeUndefined();
    }
  });

  it("can inject an invalid proposal", async () => {
    const gateway = createMockAipmGateway({ invalidSpecProposal: true });
    const response = await gateway.invoke(validAipmRequest({ operation: "GENERATE_SPEC" }));

    expect(response.status).toBe("SUCCESS");
    if (response.status === "SUCCESS") {
      expect(safeParseSpecDocument(response.result.specProposal).success).toBe(false);
    }
  });

  it("can inject a mismatched invocation id", async () => {
    const gateway = createMockAipmGateway({ mismatchInvocationId: true });
    const request = validAipmRequest();
    const response = await gateway.invoke(request);

    expect(response.invocationId).not.toBe(request.invocationId);
  });
});
