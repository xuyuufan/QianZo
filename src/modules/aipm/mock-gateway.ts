import { specLimits, type SpecDocumentV1 } from "@/modules/specs/document";

import { AIPM_CONTRACT_VERSION, type AipmRequest, type AipmResponse } from "./contract";
import type { AipmGateway } from "./gateway";

/**
 * Deterministic in-process mock: the same request always produces the same
 * response, so the interview and the generated candidate are reproducible in
 * demos and tests. It never writes to the database — the platform owns the
 * session and the messages.
 */

const interviewQuestions = [
  "请说明这个项目要解决的问题，以及希望达成的业务目标。",
  "请列出主要使用者角色，以及他们在系统中的职责。",
  "请说明必须包含的功能范围，以及明确不做的内容。",
  "请补充技术或集成约束，例如必须对接的系统或已有技术栈。",
  "请给出可验收的里程碑，以及每个里程碑的验收标准。",
] as const;

const missingInformationByTurn = [
  ["使用者角色", "功能范围与不做事项", "验收标准"],
  ["功能范围与不做事项", "验收标准"],
  ["验收标准"],
  [],
] as const;

/**
 * Fault injection used by the tests (delay, FAILED, missing spec, wrong
 * correlation id, invalid document or a completely arbitrary payload).
 */
export type MockAipmBehavior = {
  delayMs?: number;
  failWith?: { code: string; message: string };
  omitSpecProposal?: boolean;
  invalidSpecProposal?: boolean;
  mismatchInvocationId?: boolean;
  mismatchContractVersion?: boolean;
  /** Bypasses the declared response type for tests that need raw payloads. */
  respondWith?: unknown;
};

export function createMockAipmGateway(behavior: MockAipmBehavior = {}): AipmGateway {
  return {
    async invoke(request: AipmRequest): Promise<AipmResponse> {
      if (behavior.delayMs && behavior.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
      }

      if (behavior.respondWith !== undefined) {
        // Deliberately unsound: the platform must treat every provider payload,
        // including this one, as untrusted input.
        return behavior.respondWith as AipmResponse;
      }

      const invocationId = behavior.mismatchInvocationId ? crypto.randomUUID() : request.invocationId;
      const contractVersion = behavior.mismatchContractVersion ? "2" : AIPM_CONTRACT_VERSION;

      if (behavior.failWith) {
        return {
          contractVersion: AIPM_CONTRACT_VERSION,
          invocationId: request.invocationId,
          status: "FAILED",
          error: behavior.failWith,
        };
      }

      const userMessages = userMessagesOf(request);
      const missingInformation = missingInformationFor(userMessages.length);
      const readyForReview = missingInformation.length === 0;

      if (request.operation === "INTERVIEW") {
        const questionIndex = Math.max(0, Math.min(userMessages.length - 1, interviewQuestions.length - 1));
        const question = interviewQuestions[questionIndex];
        return {
          contractVersion: contractVersion as typeof AIPM_CONTRACT_VERSION,
          invocationId,
          status: "SUCCESS",
          result: {
            assistantMessage: describeTurn(question, missingInformation),
            completeness: { readyForReview, missingInformation: [...missingInformation] },
          },
        };
      }

      const proposal = behavior.invalidSpecProposal
        ? ({ schemaVersion: 1, projectGoal: "" } as unknown as SpecDocumentV1)
        : buildSpecProposal(request, userMessages);

      return {
        contractVersion: contractVersion as typeof AIPM_CONTRACT_VERSION,
        invocationId,
        status: "SUCCESS",
        result: {
          assistantMessage: describeTurn(
            "已根据当前访谈整理出一版候选 Spec，请在下方审阅。",
            missingInformation,
          ),
          completeness: { readyForReview, missingInformation: [...missingInformation] },
          ...(behavior.omitSpecProposal ? {} : { specProposal: proposal }),
        },
      };
    },
  };
}

export const mockAipmGateway = createMockAipmGateway();

function userMessagesOf(request: AipmRequest) {
  return request.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);
}

function missingInformationFor(userMessageCount: number): readonly string[] {
  const index = Math.max(0, Math.min(userMessageCount - 1, missingInformationByTurn.length - 1));
  return missingInformationByTurn[index];
}

function describeTurn(reply: string, missingInformation: readonly string[]) {
  if (missingInformation.length === 0) {
    return reply;
  }
  return `${reply}\n\n还需要补充：${missingInformation.join("、")}。`;
}

function buildSpecProposal(request: AipmRequest, userMessages: string[]): SpecDocumentV1 {
  const fallback = request.project.originalRequirement.trim() || request.project.title.trim();
  const goalSource = userMessages[0] ?? fallback;

  const featureSeeds = userMessages.length > 1 ? userMessages.slice(1, 4) : [goalSource];
  const features = featureSeeds.map((seed, index) => ({
    id: `feature-${index + 1}`,
    title: firstLine(seed, 60),
    description: clampText(seed, specLimits.longTextLength),
    userRoleIds: ["role-requester", "role-operator"],
  }));

  return {
    schemaVersion: 1,
    projectGoal: clampText(goalSource, specLimits.longTextLength),
    background: `由项目「${request.project.title}」的访谈记录整理，属于待企业确认的候选内容。`,
    userRoles: [
      {
        id: "role-requester",
        name: "需求方",
        description: "提出需求、确认范围并逐条验收交付物的业务方。",
      },
      {
        id: "role-operator",
        name: "执行方",
        description: "按锁定 Spec 交付成果并提供验收证据的开发方。",
      },
    ],
    features,
    pages: features.map((feature, index) => ({
      id: `page-${index + 1}`,
      name: firstLine(`页面：${feature.title}`, specLimits.shortTextLength),
      purpose: `承载「${feature.title}」相关的操作与流程。`,
      featureIds: [feature.id],
    })),
    userFlows: [
      {
        id: "flow-1",
        name: "需求确认到验收",
        steps: [
          "需求方提交需求、约束与验收标准。",
          "企业锁定 Spec 并发布招募信息。",
          "执行方按里程碑交付成果。",
          "需求方逐条验收并记录结论。",
        ],
      },
    ],
    // 没有真实集成需求时不虚构条目。
    integrations: [],
    technicalConstraints: [
      "本地演示使用合成数据，不接入真实模型与真实支付。",
      "开发范围以锁定版本为准，执行期间不单独改写范围。",
    ],
    deliverables: [
      {
        id: "deliverable-1",
        title: "可运行的交付版本",
        description: "覆盖已确认功能范围的实现，可在本地环境运行。",
      },
      {
        id: "deliverable-2",
        title: "验收记录",
        description: "对应每条验收标准的逐条结果与验证方式说明。",
      },
    ],
    milestones: [
      {
        id: "milestone-1",
        title: "核心功能可用",
        description: clampText(features[0].description, specLimits.longTextLength),
        dueAfterDays: 14,
        deliverableIds: ["deliverable-1"],
        acceptanceCriteria: [
          {
            id: "criterion-1-1",
            description: "已确认的核心流程可以完整走通，无阻塞性错误。",
            verificationMethod: "需求方按功能清单逐项操作并记录结果。",
          },
        ],
      },
      {
        id: "milestone-2",
        title: "整体验收",
        description: "完成全部交付物并逐条核对验收标准。",
        dueAfterDays: 30,
        deliverableIds: ["deliverable-2"],
        acceptanceCriteria: [
          {
            id: "criterion-2-1",
            description: "全部里程碑的验收标准均已通过。",
            verificationMethod: "逐条核对验收清单并留存记录。",
          },
          {
            id: "criterion-2-2",
            description: "交付物与 Spec 描述的范围一致，未擅自增删义务。",
            verificationMethod: "对照锁定 Spec 检查交付物清单。",
          },
        ],
      },
    ],
    outOfScope: ["本期不包含真实支付、生产部署与移动端适配。"],
    assumptions: ["需求方在每个里程碑完成后 3 个工作日内给出验收结论。"],
  };
}

function firstLine(text: string, maxLength: number) {
  const [line = ""] = text.split(/\r?\n/);
  const trimmed = line.trim() || text.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function clampText(text: string, maxLength: number) {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
