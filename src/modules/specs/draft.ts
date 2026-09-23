import type { SpecDocumentV1 } from "./document";

/**
 * Starting point for a hand-written Spec. It is structurally valid on purpose so
 * the editor does not open with a wall of errors, and every value is an explicit
 * placeholder the enterprise has to replace.
 */
export function emptySpecDraft(project: {
  title: string;
  originalRequirement: string;
}): SpecDocumentV1 {
  return {
    schemaVersion: 1,
    projectGoal: project.originalRequirement.trim() || project.title,
    background: "",
    userRoles: [
      {
        id: "role-1",
        name: "需求方",
        description: "提出需求并在每个里程碑后逐条验收。",
      },
    ],
    features: [
      {
        id: "feature-1",
        title: project.title,
        description: "待补充：这项功能要解决什么问题。",
        userRoleIds: ["role-1"],
      },
    ],
    pages: [],
    userFlows: [],
    integrations: [],
    technicalConstraints: [],
    deliverables: [
      {
        id: "deliverable-1",
        title: "可运行的交付版本",
        description: "待补充：交付物包含哪些内容。",
      },
    ],
    milestones: [
      {
        id: "milestone-1",
        title: "首次交付",
        description: "待补充：这个里程碑完成什么。",
        dueAfterDays: 14,
        deliverableIds: ["deliverable-1"],
        acceptanceCriteria: [
          {
            id: "criterion-1-1",
            description: "待补充：可被验证的验收标准。",
            verificationMethod: "待补充：如何验证这条标准。",
          },
        ],
      },
    ],
    outOfScope: [],
    assumptions: [],
  };
}
