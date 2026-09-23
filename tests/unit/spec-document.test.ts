import { describe, expect, it } from "vitest";

import { safeParseSpecDocument, specDeliveryDays } from "@/modules/specs/document";

import { validSpecDocument } from "../helpers/spec-fixture";

function issuesOf(document: unknown) {
  const result = safeParseSpecDocument(document);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("SpecDocumentV1 validator", () => {
  it("accepts a complete document and derives the delivery window from the last milestone", () => {
    const document = validSpecDocument();
    const result = safeParseSpecDocument(document);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(specDeliveryDays(result.data)).toBe(24);
    }
  });

  const requiredContentCases: Array<[string, Record<string, unknown>]> = [
    ["empty project goal", { projectGoal: "" }],
    ["empty user roles", { userRoles: [] }],
    ["empty features", { features: [] }],
    ["empty deliverables", { deliverables: [] }],
    ["empty milestones", { milestones: [] }],
  ];

  it.each(requiredContentCases)("rejects required content that is %s", (_label, override) => {
    expect(issuesOf({ ...validSpecDocument(), ...override }).length).toBeGreaterThan(0);
  });

  it("rejects an unknown schema version", () => {
    expect(issuesOf({ ...validSpecDocument(), schemaVersion: 2 }).length).toBeGreaterThan(0);
  });

  it("rejects undeclared top-level keys", () => {
    expect(issuesOf({ ...validSpecDocument(), secretExtra: "value" }).length).toBeGreaterThan(0);
  });

  it("rejects duplicate element ids inside a collection and across collections", () => {
    const document = validSpecDocument();
    const insideCollection = {
      ...document,
      userRoles: [
        document.userRoles[0],
        { ...document.userRoles[1], id: document.userRoles[0].id },
      ],
    };
    expect(issuesOf(insideCollection).join("\n")).toContain("重复");

    const acrossCollections = {
      ...document,
      deliverables: [{ ...document.deliverables[0], id: "feature-intake" }, document.deliverables[1]],
    };
    expect(issuesOf(acrossCollections).join("\n")).toContain("重复");
  });

  const referenceCases: Array<[string, Record<string, unknown>]> = [
    [
      "a feature referencing a missing role",
      { features: [{ ...validSpecDocument().features[0], userRoleIds: ["role-missing"] }] },
    ],
    [
      "a page referencing a missing feature",
      { pages: [{ ...validSpecDocument().pages[0], featureIds: ["feature-missing"] }] },
    ],
    [
      "a milestone referencing a missing deliverable",
      {
        milestones: [
          { ...validSpecDocument().milestones[0], deliverableIds: ["deliverable-missing"] },
          validSpecDocument().milestones[1],
        ],
      },
    ],
  ];

  it.each(referenceCases)("rejects %s", (_label, override) => {
    expect(issuesOf({ ...validSpecDocument(), ...override }).join("\n")).toContain("不存在");
  });

  it("rejects a milestone without acceptance criteria", () => {
    const document = validSpecDocument();
    const result = issuesOf({
      ...document,
      milestones: [{ ...document.milestones[0], acceptanceCriteria: [] }, document.milestones[1]],
    });

    expect(result.length).toBeGreaterThan(0);
  });

  const dueAfterDaysCases: Array<[string, number]> = [
    ["a fractional value", 10.5],
    ["a zero value", 0],
    ["a negative value", -3],
  ];

  it.each(dueAfterDaysCases)("rejects dueAfterDays with %s", (_label, dueAfterDays) => {
    const document = validSpecDocument();
    const result = issuesOf({
      ...document,
      milestones: [{ ...document.milestones[0], dueAfterDays }, document.milestones[1]],
    });

    expect(result.length).toBeGreaterThan(0);
  });

  it("rejects milestones whose dueAfterDays does not strictly increase", () => {
    const document = validSpecDocument();
    const result = issuesOf({
      ...document,
      milestones: [
        document.milestones[0],
        { ...document.milestones[1], dueAfterDays: document.milestones[0].dueAfterDays },
      ],
    });

    expect(result.join("\n")).toContain("严格递增");
  });
});
