"use client";

import { useActionState } from "react";

import { emptySpecActionState } from "@/app/actions/spec-state";
import { lockSpecAction } from "@/app/actions/specs";

type LockSpecFormProps = {
  projectId: string;
  version: number;
  specVersionId: string;
  budgetLabel: string;
};

export function LockSpecForm({
  projectId,
  version,
  specVersionId,
  budgetLabel,
}: LockSpecFormProps) {
  const action = lockSpecAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptySpecActionState);

  return (
    <form action={formAction} className="project-form">
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="specVersionId" type="hidden" value={specVersionId} />
      <p className="spec-muted">
        锁定后冻结标题、原始需求、参考预算（{budgetLabel}）与当前 Spec 版本。S1 不提供解锁，
        你仍然可以查看所有历史版本。
      </p>
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
      <button className="button" type="submit" disabled={pending}>
        {pending ? "锁定中…" : "确认锁定当前版本"}
      </button>
    </form>
  );
}
