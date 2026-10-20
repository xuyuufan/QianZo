"use client";

import { useActionState, useState } from "react";

import { emptySpecActionState } from "@/app/actions/spec-state";
import { lockSpecAction } from "@/app/actions/specs";

type LockSpecFormProps = {
  projectId: string;
  version: number;
  specVersionId: string;
  specVersionNo: number;
  title: string;
  originalRequirement: string;
  budgetLabel: string;
};

export function LockSpecForm({
  projectId,
  version,
  specVersionId,
  specVersionNo,
  title,
  originalRequirement,
  budgetLabel,
}: LockSpecFormProps) {
  const action = lockSpecAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptySpecActionState);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="lock-spec-form">
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="specVersionId" type="hidden" value={specVersionId} />
      <details className="lock-scope-details">
        <summary>核对将要锁定的内容</summary>
        <dl>
          <div><dt>Spec 版本</dt><dd>v{specVersionNo}</dd></div>
          <div><dt>项目标题</dt><dd>{title}</dd></div>
          <div><dt>参考预算</dt><dd>{budgetLabel}</dd></div>
          <div><dt>原始需求</dt><dd className="whitespace-pre-wrap">{originalRequirement || "未填写"}</dd></div>
        </dl>
      </details>
      <p className="spec-muted">锁定后上述内容不可更改，S1 不提供解锁；所有 Spec 历史版本仍可查看。</p>
      <label className="choice-card lock-scope-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        <span>我已核对标题、原始需求、参考预算和 Spec v{specVersionNo}，确认锁定当前范围。</span>
      </label>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      {state.issues.length > 0 ? (
        <ul className="issue-list" role="alert">
          {state.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <button className="button" type="submit" disabled={pending || !confirmed}>
        {pending ? "锁定中…" : "确认锁定当前版本"}
      </button>
    </form>
  );
}
