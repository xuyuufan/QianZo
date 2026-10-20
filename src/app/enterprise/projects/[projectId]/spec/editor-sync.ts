/**
 * Keeps the manual Spec editor in step with the server's current version.
 *
 * The editor is seeded from the current version, and the page revalidates after
 * every action on it. Generating a candidate from the interview form therefore
 * changes the current content while the user may already have typed manual
 * edits, and following the server unconditionally would silently discard them.
 *
 * So a clean editor follows the server, and a dirty one keeps what the user
 * typed; it starts following again as soon as its content matches a server
 * value. Matching is done on the schema-normalised document rather than the raw
 * JSON string, because the server trims text fields before storing them: after
 * a save, the value the server serves back differs from what the textarea held
 * only by that trimming, and a raw string comparison would leave the editor
 * stuck in a permanent "unsaved" state. Pure and dependency-free (the shared
 * schema is a side-effect-free module) so the decision can be unit tested.
 */

import { specDocumentSchema } from "@/modules/specs/document";

export type EditorSync = {
  /** The server value this edit session has now seen. */
  syncedContent: string;
  /** What the textarea should hold. */
  content: string;
};

/**
 * Canonicalises a content string so two documents that differ only by the
 * schema's text normalisation (leading/trailing whitespace, which `.trim()`
 * removes) compare as equal. Returns the raw value unchanged when the input is
 * not a valid Spec document, for example while the user is mid-edit or when a
 * unit test passes an opaque placeholder string.
 */
function normalizeContent(raw: string): string {
  try {
    const parsed = specDocumentSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return JSON.stringify(parsed.data);
    }
  } catch {
    // Not JSON yet — compare the raw value instead.
  }
  return raw;
}

export function syncEditorWithServer(params: {
  /** The current version's content as sent by the server. */
  initialContent: string;
  /** What the textarea holds right now. */
  content: string;
  /** The server value the editor last adopted. */
  syncedContent: string;
}): EditorSync | null {
  const { initialContent, content, syncedContent } = params;

  if (initialContent === syncedContent) {
    return null;
  }

  const normalizedContent = normalizeContent(content);
  // The editor is clean when its content matches either the value it last
  // adopted or the value the server now holds. The second case covers a save
  // whose only change was whitespace the server trimmed: the textarea still has
  // the untrimmed text, but it is already persisted, so the editor is clean.
  const isDirty =
    normalizedContent !== normalizeContent(syncedContent)
    && normalizedContent !== normalizeContent(initialContent);
  return {
    syncedContent: initialContent,
    content: isDirty ? content : initialContent,
  };
}
