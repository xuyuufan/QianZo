import { describe, expect, it } from "vitest";

import { specDocumentSchema } from "@/modules/specs/document";
import {
  createStableSpecId,
  moveSpecItem,
  specReferenceBlockers,
} from "@/app/enterprise/projects/[projectId]/spec/spec-editor-model";

import { validSpecDocument } from "../helpers/spec-fixture";

describe("structured Spec editor model", () => {
  it("creates schema-safe stable ids while preserving existing ids in document edits", () => {
    const generated = createStableSpecId("里程碑 / 验收", "00000000-0000-4000-8000-000000000001");
    expect(generated).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);

    const document = validSpecDocument();
    const originalRoleId = document.userRoles[0].id;
    const edited = {
      ...document,
      projectGoal: "修改目标",
      features: [...document.features, {
        id: generated,
        title: "新功能",
        description: "新增功能说明。",
        userRoleIds: [],
      }],
    };

    expect(edited.userRoles[0].id).toBe(originalRoleId);
    expect(specDocumentSchema.parse(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
  });

  it("moves list entries in either direction without changing their identity", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveSpecItem(items, 1, -1).map(({ id }) => id)).toEqual(["b", "a", "c"]);
    expect(moveSpecItem(items, 1, 1).map(({ id }) => id)).toEqual(["a", "c", "b"]);
    expect(moveSpecItem(items, 0, -1)).toEqual(items);
    expect(items.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("reports references that must be removed before a role, feature, or deliverable can be deleted", () => {
    const document = validSpecDocument();
    expect(specReferenceBlockers(document, "userRoles", "role-owner")).toEqual([
      "feature-intake",
      "feature-review",
    ]);
    expect(specReferenceBlockers(document, "features", "feature-intake")).toEqual([
      "page-intake",
    ]);
    expect(specReferenceBlockers(document, "deliverables", "deliverable-app")).toEqual([
      "milestone-core",
    ]);

    const unlinked = {
      ...document,
      features: document.features.map((feature) => ({
        ...feature,
        userRoleIds: feature.userRoleIds.filter((id) => id !== "role-owner"),
      })),
      pages: document.pages.map((page) => ({
        ...page,
        featureIds: page.featureIds.filter((id) => id !== "feature-intake"),
      })),
      milestones: document.milestones.map((milestone) => ({
        ...milestone,
        deliverableIds: milestone.deliverableIds.filter((id) => id !== "deliverable-app"),
      })),
    };
    expect(specReferenceBlockers(unlinked, "userRoles", "role-owner")).toEqual([]);
    expect(specReferenceBlockers(unlinked, "features", "feature-intake")).toEqual([]);
    expect(specReferenceBlockers(unlinked, "deliverables", "deliverable-app")).toEqual([]);
  });

  it("round-trips every SpecDocumentV1 field without dropping nested acceptance methods", () => {
    const source = validSpecDocument();
    const restored = specDocumentSchema.parse(JSON.parse(JSON.stringify(source)));
    expect(restored).toEqual(source);
    expect(restored.milestones[0].acceptanceCriteria[0].verificationMethod).toBe(
      source.milestones[0].acceptanceCriteria[0].verificationMethod,
    );
  });
});
