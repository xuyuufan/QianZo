"use client";

import { useActionState, useMemo, useState } from "react";

import { emptySpecActionState } from "@/app/actions/spec-state";
import { saveSpecVersionAction } from "@/app/actions/specs";
import { specDocumentSchema } from "@/modules/specs/document";
import { describeFieldIssues } from "@/platform/validation";

import { syncEditorWithServer } from "./editor-sync";

type SpecEditorFormProps = {
  projectId: string;
  version: number;
  initialContent: string;
};

/**
 * First-round editor: a JSON document with field-level messages from the same
 * shared validator the server uses. The server validates the document again
 * before anything is stored.
 */
export function SpecEditorForm({ projectId, version, initialContent }: SpecEditorFormProps) {
  const action = saveSpecVersionAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptySpecActionState);
  const [content, setContent] = useState(initialContent);
  const [syncedContent, setSyncedContent] = useState(initialContent);

  // A new current version arrives from the server: follow it instead of keeping
  // the stale value, without remounting the form (which would drop the action
  // result). Unsaved edits win over the server value, so generating a candidate
  // from the interview form on this page cannot wipe what the user just typed.
  // Adjusting state during render is the documented derived-state pattern, and
  // the two values match again on the next render.
  const synced = syncEditorWithServer({ initialContent, content, syncedContent });
  if (synced) {
    setSyncedContent(synced.syncedContent);
    setContent(synced.content);
  }

  const validation = useMemo(() => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      return { issues: ["内容不是合法的 JSON。"] };
    }
    const parsed = specDocumentSchema.safeParse(parsedJson);
    return { issues: parsed.success ? [] : describeFieldIssues(parsed.error) };
  }, [content]);

  const issues = validation.issues.length > 0 ? validation.issues : state.issues;

  return (
    <form action={formAction} className="project-form">
      <input name="expectedVersion" type="hidden" value={version} />
      <label className="field">
        <span>Spec 文档（JSON）</span>
        <textarea
          className="spec-json"
          name="document"
          rows={24}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
        />
      </label>
      {issues.length > 0 ? (
        <ul className="issue-list" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p className="form-message success" role="status">
          结构校验通过，保存后会作为新版本记录。
        </p>
      )}
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      {state.successMessage ? (
        <p className="form-message success" role="status">
          {state.successMessage}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending || issues.length > 0}>
        {pending ? "正在保存…" : "保存为新版本"}
      </button>
    </form>
  );
}
