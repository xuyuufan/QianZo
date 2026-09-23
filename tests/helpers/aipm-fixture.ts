import { randomUUID } from "node:crypto";

import { AIPM_CONTRACT_VERSION, type AipmRequest } from "@/modules/aipm/contract";

export function validAipmRequest(overrides: Partial<AipmRequest> = {}): AipmRequest {
  return {
    contractVersion: AIPM_CONTRACT_VERSION,
    invocationId: randomUUID(),
    operation: "INTERVIEW",
    project: {
      id: randomUUID(),
      title: "合成项目",
      originalRequirement: "希望把模糊需求整理成可招募的确认范围。",
    },
    sessionId: randomUUID(),
    messages: [],
    baseSpec: null,
    ...overrides,
  };
}

export function userTranscript(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    role: "user" as const,
    content: `第 ${index + 1} 条合成需求说明`,
  }));
}
