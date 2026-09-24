import { describe, expect, it } from "vitest";

import { syncEditorWithServer } from "@/app/enterprise/projects/[projectId]/spec/editor-sync";

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
});
