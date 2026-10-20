"use client";

import { useActionState } from "react";

import { emptySpecActionState } from "@/app/actions/spec-state";
import { adoptSpecProposalAction } from "@/app/actions/specs";

type AdoptCandidateFormProps = {
  projectId: string;
  version: number;
  sourceMessageId: string;
  disabled?: boolean;
};

export function AdoptCandidateForm({
  projectId,
  version,
  sourceMessageId,
  disabled = false,
}: AdoptCandidateFormProps) {
  const action = adoptSpecProposalAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptySpecActionState);

  return (
    <form action={formAction} className="adopt-candidate-form">
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="sourceMessageId" type="hidden" value={sourceMessageId} />
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      {state.issues.length > 0 ? (
        <ul className="issue-list">
          {state.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <button className="button" type="submit" disabled={pending || disabled}>
        {pending ? "采用中…" : "采用为当前 Spec 版本"}
      </button>
    </form>
  );
}
