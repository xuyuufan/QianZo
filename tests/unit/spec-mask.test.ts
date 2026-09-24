import { describe, expect, it } from "vitest";

import type { SpecDocumentV1 } from "@/modules/specs/document";
import { maskSpecIssues } from "@/modules/specs/mask";

import { validSpecDocument } from "../helpers/spec-fixture";

function maskedDocument() {
  const document = structuredClone(validSpecDocument());
  document.projectGoal = "合成目标：把需求整理成可招募的确认范围。";
  document.background = "由合成访谈整理。";
  document.userRoles[0].name = "需求方";
  document.features[0].title = "需求整理";
  document.features[0].description = "把原始需求整理成结构化范围。";
  document.pages[0].purpose = "承载访谈与候选生成。";
  document.userFlows[0].steps[0] = "整理需求（脱敏）";
  document.technicalConstraints[0] = "本地演示只使用合成数据。";
  document.milestones[0].description = "完成核心范围。";
  document.milestones[0].acceptanceCriteria[0].description = "核心流程可以完整走通。";
  document.milestones[0].acceptanceCriteria[0].verificationMethod = "按清单逐项操作。";
  return document;
}

describe("recruitment masking rules", () => {
  it("accepts a preview that only replaces text", () => {
    expect(maskSpecIssues(validSpecDocument(), maskedDocument())).toEqual([]);
    expect(maskSpecIssues(validSpecDocument(), validSpecDocument())).toEqual([]);
  });

  const structuralChanges: Array<[string, (document: SpecDocumentV1) => void, string]> = [
    [
      "removing a feature",
      (document) => {
        document.features = document.features.slice(0, 1);
      },
      "功能的数量不能改变",
    ],
    [
      "renaming an element id",
      (document) => {
        document.deliverables[0].id = "deliverable-renamed";
      },
      "元素 ID 与顺序必须保留",
    ],
    [
      "dropping a role reference",
      (document) => {
        document.features[0].userRoleIds = [];
      },
      "使用者角色引用必须保留",
    ],
    [
      "shortening the timeline",
      (document) => {
        document.milestones[1].dueAfterDays = 12;
      },
      "dueAfterDays 不能改变",
    ],
    [
      "removing an acceptance criterion",
      (document) => {
        document.milestones[1].acceptanceCriteria.pop();
      },
      "验收标准的数量不能改变",
    ],
    [
      "removing a flow step",
      (document) => {
        document.userFlows[0].steps = ["只剩一步"];
      },
      "步骤数量不能改变",
    ],
    [
      "removing an out-of-scope item",
      (document) => {
        document.outOfScope = [];
      },
      "不做的事项的条目数量不能改变",
    ],
  ];

  it.each(structuralChanges)("rejects %s", (_label, mutate, expected) => {
    const document = maskedDocument();
    mutate(document);

    const issues = maskSpecIssues(validSpecDocument(), document);
    expect(issues.join("\n")).toContain(expected);
  });
});
