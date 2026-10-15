import type { SpecDocumentV1 } from "@/modules/specs/document";

/**
 * Independently written SpecDocumentV1 fixture used by the validator unit tests
 * and the integration tests. It is deliberately not produced by the mock
 * gateway, so a passing test does not just re-check the mock against itself.
 */
export function validSpecDocument(): SpecDocumentV1 {
  return {
    schemaVersion: 1,
    projectGoal: "让企业可以把模糊需求整理成可招募的确认范围。",
    background: "来自企业访谈的整理结果。",
    userRoles: [
      { id: "role-owner", name: "企业负责人", description: "确认范围并锁定 Spec。" },
      { id: "role-builder", name: "交付方", description: "按锁定范围交付并提交验收证据。" },
    ],
    features: [
      {
        id: "feature-intake",
        title: "需求整理",
        description: "把原始需求整理成结构化的确认范围。",
        userRoleIds: ["role-owner"],
      },
      {
        id: "feature-review",
        title: "范围确认",
        description: "查看版本历史并锁定一个版本。",
        userRoleIds: ["role-owner", "role-builder"],
      },
    ],
    pages: [
      {
        id: "page-intake",
        name: "需求整理页",
        purpose: "承载访谈与候选生成。",
        featureIds: ["feature-intake"],
      },
    ],
    userFlows: [
      {
        id: "flow-lock",
        name: "从访谈到锁定",
        steps: ["整理需求", "确认范围", "锁定版本"],
      },
    ],
    integrations: [],
    technicalConstraints: ["本地演示只使用合成数据。"],
    deliverables: [
      { id: "deliverable-app", title: "可运行版本", description: "覆盖确认范围的实现。" },
      { id: "deliverable-report", title: "验收记录", description: "逐条验收结论。" },
    ],
    milestones: [
      {
        id: "milestone-core",
        title: "核心功能可用",
        description: "完成核心范围并在本地运行。",
        dueAfterDays: 10,
        deliverableIds: ["deliverable-app"],
        acceptanceCriteria: [
          {
            id: "criterion-core-1",
            description: "核心流程可以完整走通。",
            verificationMethod: "按功能清单逐项操作。",
          },
        ],
      },
      {
        id: "milestone-accept",
        title: "整体验收",
        description: "完成全部交付物并逐条验收。",
        dueAfterDays: 24,
        deliverableIds: ["deliverable-report"],
        acceptanceCriteria: [
          {
            id: "criterion-accept-1",
            description: "全部验收标准通过。",
            verificationMethod: "逐条核对验收清单。",
          },
        ],
      },
    ],
    outOfScope: ["不含真实支付与生产部署。"],
    assumptions: ["企业会在三个工作日内完成验收。"],
  };
}
