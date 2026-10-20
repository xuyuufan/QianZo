/**
 * Keeps a dirty Spec draft recoverable across a navigation.
 *
 * The unsaved-edit guard cannot reliably intercept every traversal: a browser
 * history change is committed by the App Router before the route component gets
 * a chance to react, so a Forward departure can unmount the editor without the
 * confirmation ever running. The guard still warns where it can, but nothing
 * may silently throw work away, so a dirty draft is mirrored here and offered
 * back when the editor is opened again.
 *
 * The storage handle is injected rather than reached for directly, so the rules
 * below stay pure and can be unit tested without a browser.
 */

/** The part of the Web Storage API this module needs. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SpecDraft = {
  /** The editor content as it was when the editor went away. */
  content: string;
  /** The server value the draft was written against. */
  serverContent: string;
};

export function specDraftStorageKey(projectId: string): string {
  return `qianzo:spec-draft:${projectId}`;
}

/**
 * The browser's session storage, or null when it cannot be reached. Some
 * browsers throw on the property access itself — not just on the methods — when
 * storage is disabled, so even taking the handle has to be guarded.
 */
export function openSpecDraftStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Drops the draft for a project, wherever storage is reachable. */
export function clearSpecDraftFor(projectId: string): void {
  const storage = openSpecDraftStorage();
  if (storage) {
    clearSpecDraft(storage, specDraftStorageKey(projectId));
  }
}

/**
 * The draft to reopen, or null when the editor should start from the server
 * value. A draft is only honoured while the server still serves the version it
 * was written against, so a stale draft can never shadow newer saved work.
 */
export function readSpecDraft(
  storage: DraftStorage,
  key: string,
  serverContent: string,
): SpecDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as Partial<SpecDraft>;
    if (typeof stored.content !== "string" || stored.serverContent !== serverContent) {
      return null;
    }
    return { content: stored.content, serverContent: stored.serverContent };
  } catch {
    return null;
  }
}

export function writeSpecDraft(storage: DraftStorage, key: string, draft: SpecDraft): void {
  try {
    storage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage can be unavailable or full. The guard above still warns, so this
    // stays best effort and must never break editing.
  }
}

export function clearSpecDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // A draft that cannot be cleared is still only a draft.
  }
}
