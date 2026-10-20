import { describe, expect, it } from "vitest";

import { syncEditorWithServer } from "@/app/enterprise/projects/[projectId]/spec/editor-sync";

/**
 * A minimal but schema-valid Spec document, used to exercise the
 * schema-aware normalisation the sync relies on for real content.
 */
const validDocument = {
  schemaVersion: 1,
  projectGoal: "目标",
  background: "",
  userRoles: [{ id: "role-1", name: "使用者", description: "负责确认范围。" }],
  features: [{ id: "feature-1", title: "功能", description: "整理需求。", userRoleIds: ["role-1"] }],
  pages: [],
  userFlows: [],
  integrations: [],
  technicalConstraints: [],
  deliverables: [{ id: "deliverable-1", title: "交付物", description: "确认范围。" }],
  milestones: [
    {
      id: "milestone-1",
      title: "里程碑",
      description: "完成范围确认。",
      dueAfterDays: 7,
      deliverableIds: ["deliverable-1"],
      acceptanceCriteria: [
        { id: "criterion-1", description: "范围已确认。", verificationMethod: "逐条核对。" },
      ],
    },
  ],
  outOfScope: [],
  assumptions: [],
};

/** Serialises a copy of the fixture with a different project goal. */
function withGoal(goal: string): string {
  return JSON.stringify({ ...validDocument, projectGoal: goal });
}

/**
 * The manual editor must follow the server's current version without ever
 * discarding unsaved edits, because generating a candidate from the interview
 * form on the same page revalidates the route and changes that version.
 */
describe("manual spec editor synchronisation", () => {
  it("does nothing while the editor has already seen the server value", () => {
    expect(
      syncEditorWithServer({
        initialContent: "v1",
        content: "v1",
        syncedContent: "v1",
      }),
    ).toBeNull();
  });

  it("follows a new server value when the editor is clean", () => {
    expect(
      syncEditorWithServer({
        initialContent: "v2",
        content: "v1",
        syncedContent: "v1",
      }),
    ).toEqual({ syncedContent: "v2", content: "v2" });
  });

  it("keeps unsaved edits when a new server value arrives", () => {
    // The user typed into the editor and then a candidate was generated.
    expect(
      syncEditorWithServer({
        initialContent: "candidate",
        content: "half-typed manual draft",
        syncedContent: "v1",
      }),
    ).toEqual({ syncedContent: "candidate", content: "half-typed manual draft" });
  });

  it("starts following the server again once the edits match a saved value", () => {
    // The manual draft was saved, so the server now serves exactly it.
    const afterSave = syncEditorWithServer({
      initialContent: "half-typed manual draft",
      content: "half-typed manual draft",
      syncedContent: "v1",
    });
    expect(afterSave).toEqual({
      syncedContent: "half-typed manual draft",
      content: "half-typed manual draft",
    });

    // A later candidate is adopted: the editor is clean again, so it follows.
    expect(
      syncEditorWithServer({
        initialContent: "next candidate",
        content: afterSave?.content ?? "",
        syncedContent: afterSave?.syncedContent ?? "",
      }),
    ).toEqual({ syncedContent: "next candidate", content: "next candidate" });
  });

  it("is clean when the only difference is whitespace the server trims on save", () => {
    // The user typed a goal with leading/trailing spaces and saved it; the
    // server stored the trimmed value, so the editor holds text that no longer
    // equals the served value byte for byte but is already persisted.
    const servedAfterSave = JSON.stringify(validDocument);
    const stillInTextarea = JSON.stringify({ ...validDocument, projectGoal: "  目标  " });

    expect(
      syncEditorWithServer({
        initialContent: servedAfterSave,
        content: stillInTextarea,
        syncedContent: withGoal("旧目标"),
      }),
    ).toEqual({ syncedContent: servedAfterSave, content: servedAfterSave });
  });

  it("stays dirty when the edit differs beyond text normalisation", () => {
    const servedAfterSave = JSON.stringify(validDocument);
    const edited = withGoal("一个和服务器完全不同的未保存目标");

    expect(
      syncEditorWithServer({
        initialContent: servedAfterSave,
        content: edited,
        syncedContent: withGoal("旧目标"),
      }),
    ).toEqual({ syncedContent: servedAfterSave, content: edited });
  });
});
