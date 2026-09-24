import { specDocumentSchema, type SpecDocumentV1 } from "./document";

/**
 * The recruitment preview is derived from the locked document and may only
 * replace human-readable text. Structure, ids, references, item counts,
 * milestone order and delivery days must survive, so masking can never quietly
 * drop an obligation or shorten the promised timeline.
 */
export function maskSpecIssues(locked: SpecDocumentV1, masked: SpecDocumentV1): string[] {
  const issues: string[] = [];

  compareIdSequence(issues, "使用者角色", locked.userRoles, masked.userRoles);
  compareIdSequence(issues, "集成", locked.integrations, masked.integrations);

  // Per-item rules only run when the item counts still match; a shorter list is
  // already reported as a structure change.
  const featuresComparable = compareIdSequence(issues, "功能", locked.features, masked.features);
  const pagesComparable = compareIdSequence(issues, "页面", locked.pages, masked.pages);
  const flowsComparable = compareIdSequence(issues, "流程", locked.userFlows, masked.userFlows);
  compareIdSequence(issues, "交付物", locked.deliverables, masked.deliverables);
  const milestonesComparable = compareIdSequence(issues, "里程碑", locked.milestones, masked.milestones);

  if (!featuresComparable) {
    compareTextListCount(issues, "技术约束", locked.technicalConstraints, masked.technicalConstraints);
    compareTextListCount(issues, "不做的事项", locked.outOfScope, masked.outOfScope);
    compareTextListCount(issues, "假设", locked.assumptions, masked.assumptions);
    return issues;
  }

  locked.features.forEach((feature, index) => {
    compareReferenceList(
      issues,
      `功能「${feature.id}」的使用者角色引用`,
      feature.userRoleIds,
      masked.features[index].userRoleIds,
    );
  });

  if (pagesComparable) locked.pages.forEach((page, index) => {
    compareReferenceList(
      issues,
      `页面「${page.id}」的功能引用`,
      page.featureIds,
      masked.pages[index].featureIds,
    );
  });

  if (flowsComparable) locked.userFlows.forEach((flow, index) => {
    if (flow.steps.length !== masked.userFlows[index].steps.length) {
      issues.push(
        `流程「${flow.id}」的步骤数量不能改变（锁定 ${flow.steps.length} 条，预览 ${masked.userFlows[index].steps.length} 条）。`,
      );
    }
  });

  if (milestonesComparable) locked.milestones.forEach((milestone, index) => {
    const maskedMilestone = masked.milestones[index];
    compareReferenceList(
      issues,
      `里程碑「${milestone.id}」的交付物引用`,
      milestone.deliverableIds,
      maskedMilestone.deliverableIds,
    );
    if (milestone.dueAfterDays !== maskedMilestone.dueAfterDays) {
      issues.push(
        `里程碑「${milestone.id}」的 dueAfterDays 不能改变（锁定 ${milestone.dueAfterDays}，预览 ${maskedMilestone.dueAfterDays}）。`,
      );
    }
    compareIdSequence(
      issues,
      `里程碑「${milestone.id}」的验收标准`,
      milestone.acceptanceCriteria,
      maskedMilestone.acceptanceCriteria,
    );
  });

  compareTextListCount(issues, "技术约束", locked.technicalConstraints, masked.technicalConstraints);
  compareTextListCount(issues, "不做的事项", locked.outOfScope, masked.outOfScope);
  compareTextListCount(issues, "假设", locked.assumptions, masked.assumptions);

  return issues;
}

/** The masked preview is only accepted when it is a valid document too. */
export function parseMaskedSpecDocument(raw: unknown) {
  return specDocumentSchema.safeParse(raw);
}

function compareIdSequence(
  issues: string[],
  label: string,
  locked: Array<{ id: string }>,
  masked: Array<{ id: string }>,
): boolean {
  if (locked.length !== masked.length) {
    issues.push(`${label}的数量不能改变（锁定 ${locked.length} 项，预览 ${masked.length} 项）。`);
    return false;
  }
  locked.forEach((item, index) => {
    if (item.id !== masked[index].id) {
      issues.push(
        `${label}的元素 ID 与顺序必须保留（第 ${index + 1} 项锁定为「${item.id}」，预览为「${masked[index].id}」）。`,
      );
    }
  });
  return true;
}

function compareReferenceList(
  issues: string[],
  label: string,
  locked: string[],
  masked: string[],
) {
  if (locked.length !== masked.length || locked.some((id, index) => id !== masked[index])) {
    issues.push(`${label}必须保留（锁定为 ${locked.join("、") || "空"}）。`);
  }
}

function compareTextListCount(
  issues: string[],
  label: string,
  locked: string[],
  masked: string[],
) {
  if (locked.length !== masked.length) {
    issues.push(`${label}的条目数量不能改变（锁定 ${locked.length} 条，预览 ${masked.length} 条）。`);
  }
}
