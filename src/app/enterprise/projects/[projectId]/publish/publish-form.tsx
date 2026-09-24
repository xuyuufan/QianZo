"use client";

import { useActionState, useMemo, useState } from "react";

import { emptyProjectActionState } from "@/app/actions/project-state";
import { publishProjectAction } from "@/app/actions/publish";
import { specDocumentSchema, type SpecDocumentV1 } from "@/modules/specs/document";
import { maskSpecIssues } from "@/modules/specs/mask";
import { describeFieldIssues } from "@/platform/validation";

type PublishFormProps = {
  projectId: string;
  version: number;
  lockedSpecVersionId: string;
  lockedTitle: string;
  lockedDocument: SpecDocumentV1;
};

export function PublishForm({
  projectId,
  version,
  lockedSpecVersionId,
  lockedTitle,
  lockedDocument,
}: PublishFormProps) {
  const action = publishProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptyProjectActionState);
  const [title, setTitle] = useState(lockedTitle);
  const [content, setContent] = useState(() => JSON.stringify(lockedDocument, null, 2));
  const [confirmed, setConfirmed] = useState(false);

  // The same validator and the same structure rules the server applies, so the
  // issues shown here are the ones that would reject the publish.
  const validation = useMemo(() => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      return { issues: ["脱敏预览不是合法的 JSON。"] };
    }
    const parsed = specDocumentSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { issues: describeFieldIssues(parsed.error) };
    }
    return { issues: maskSpecIssues(lockedDocument, parsed.data) };
  }, [content, lockedDocument]);

  const issues = validation.issues.length > 0 ? validation.issues : state.issues;
  const blocked = issues.length > 0 || !confirmed;

  return (
    <form action={formAction} className="project-form">
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="lockedSpecVersionId" type="hidden" value={lockedSpecVersionId} />
      <label className="field">
        <span>招募标题（脱敏后）</span>
        <input
          name="maskedTitle"
          type="text"
          value={title}
          maxLength={120}
          required
          onChange={(event) => {
            setTitle(event.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="field">
        <span>脱敏预览（JSON）</span>
        <textarea
          className="spec-json"
          name="maskedDocument"
          rows={20}
          value={content}
          spellCheck={false}
          onChange={(event) => {
            setContent(event.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <p className="spec-muted">
        只能替换文字：结构 ID、引用、条目数量、里程碑顺序与 dueAfterDays 必须与锁定版本一致，
        验收标准也不能删减。
      </p>
      {issues.length > 0 ? (
        <ul className="issue-list" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p className="form-message success" role="status">
          结构与锁定版本一致，可以确认发布。
        </p>
      )}
      <label className="choice-card">
        <input
          name="confirmed"
          type="checkbox"
          value="on"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          我已确认这是最终预览
          <small>改标题或改预览后需要重新勾选确认。</small>
        </span>
      </label>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending || blocked}>
        {pending ? "正在发布…" : "确认并发布招募"}
      </button>
    </form>
  );
}
