import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  reviewDeliveryInputSchema,
  submitDeliveryInputSchema,
} from "@/modules/delivery/validation";

const submissionInput = {
  projectId: randomUUID(),
  milestoneId: randomUUID(),
  submissionKey: randomUUID(),
  expectedCurrentSubmissionId: null,
  summary: "交付已部署的演示。",
  links: ["https://example.com/demo"],
};

describe("delivery input validation", () => {
  it("canonicalizes HTTP(S) links before they are stored or compared for replay", () => {
    const result = submitDeliveryInputSchema.parse({
      ...submissionInput,
      links: ["HTTPS://Example.COM/repository"],
    });
    expect(result.links).toEqual(["https://example.com/repository"]);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///C:/private.txt",
    "ftp://example.com/file.zip",
    "https://user:password@example.com/",
    " https://example.com/",
    "https://example.com/\n",
  ])("rejects an unsafe URL: %s", (url) => {
    expect(() => submitDeliveryInputSchema.parse({ ...submissionInput, links: [url] })).toThrow();
  });

  it("rejects duplicate canonical URLs and more than ten links", () => {
    expect(() =>
      submitDeliveryInputSchema.parse({
        ...submissionInput,
        links: ["https://example.com", "https://EXAMPLE.com/"],
      }),
    ).toThrow();
    expect(() =>
      submitDeliveryInputSchema.parse({
        ...submissionInput,
        links: Array.from({ length: 11 }, (_, index) => `https://example.com/${index}`),
      }),
    ).toThrow();
  });

  it("rejects extra review identifiers so the server binds criteria by frozen position", () => {
    expect(() => reviewDeliveryInputSchema.parse({
      projectId: randomUUID(),
      milestoneId: randomUUID(),
      submissionId: randomUUID(),
      criteriaResults: [{ position: 1, outcome: "PASS", criterionId: "private-spec-id" }],
    })).toThrow();
  });
});
