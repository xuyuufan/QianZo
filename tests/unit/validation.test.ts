import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { SpecDocumentV1 } from "@/modules/specs/document";
import { specDocumentSchema } from "@/modules/specs/document";
import { describeFieldIssues } from "@/platform/validation";

import { validSpecDocument } from "../helpers/spec-fixture";

describe("describeFieldIssues", () => {
  it("joins a nested schema path with dots and keeps the issue message verbatim", () => {
    const document: SpecDocumentV1 = validSpecDocument();
    // 10 days is no longer strictly greater than the first milestone's 10 days.
    document.milestones[1].dueAfterDays = document.milestones[0].dueAfterDays;

    const parsed = specDocumentSchema.safeParse(document);
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("The document must fail the strictly increasing timeline rule.");
    }

    expect(describeFieldIssues(parsed.error)).toEqual([
      "milestones.1.dueAfterDays: dueAfterDays 必须是严格递增的正整数，里程碑按文档顺序执行（相对开工时间的累计自然日）。",
    ]);
  });

  it("reports every issue of a document that violates several rules at once", () => {
    const document: SpecDocumentV1 = validSpecDocument();
    document.features[0].userRoleIds = ["role-missing"];
    document.milestones[0].acceptanceCriteria = [];

    const parsed = specDocumentSchema.safeParse(document);
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("The document must fail with dangling references.");
    }

    const issues = describeFieldIssues(parsed.error);
    expect(issues).toHaveLength(2);
    // Zod reports the base-schema issue and the refinement issue in its own
    // order, so the assertions must not depend on that ordering.
    const featureIssue = issues.find((issue) => issue.startsWith("features.0.userRoleIds: "));
    const milestoneIssue = issues.find((issue) =>
      issue.startsWith("milestones.0.acceptanceCriteria: "),
    );
    expect(featureIssue).toContain('功能 "feature-intake" 引用了不存在的使用者角色 "role-missing"。');
    expect(milestoneIssue).toBeDefined();
  });

  it("falls back to the bare message when the issue has no path", () => {
    const parsed = z.string().safeParse(123);
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("The value must fail the string schema.");
    }

    const [issue] = parsed.error.issues;
    expect(issue.path).toEqual([]);

    const issues = describeFieldIssues(parsed.error);
    expect(issues).toEqual([issue.message]);
    // The degradation must not leak an empty path prefix such as ": message".
    expect(issues[0]).toBe(issue.message);
  });
});
