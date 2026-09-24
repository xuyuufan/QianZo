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
 * value. Pure and dependency-free so the decision can be unit tested.
 */

export type EditorSync = {
  /** The server value this edit session has now seen. */
  syncedContent: string;
  /** What the textarea should hold. */
  content: string;
};

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

  const isDirty = content !== syncedContent;
  return {
    syncedContent: initialContent,
    content: isDirty ? content : initialContent,
  };
}
