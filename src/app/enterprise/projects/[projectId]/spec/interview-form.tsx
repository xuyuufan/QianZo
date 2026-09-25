"use client";

import { useActionState } from "react";

import { emptyAipmActionState } from "@/app/actions/aipm-state";
import { invokeAipmAction } from "@/app/actions/aipm";

type InterviewFormProps = {
  projectId: string;
  version: number;
};

export function InterviewForm({ projectId, version }: InterviewFormProps) {
  const action = invokeAipmAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptyAipmActionState);

  return (
    <form action={formAction} className="form-stack">
      <input name="expectedVersion" type="hidden" value={version} />
      <label className="field">
        <span>访谈回复</span>
        <textarea
          name="message"
          rows={6}
          maxLength={4000}
          required
          placeholder="按 Mock AIPM 的提问补充需求、范围、约束或验收标准。"
        />
      </label>
      <label className="field">
        <span>附加指令（可选）</span>
        <input name="instruction" type="text" maxLength={2000} />
      </label>
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
      <div className="form-actions">
        <button className="button" type="submit" name="operation" value="INTERVIEW" disabled={pending}>
          {pending ? "处理中…" : "发送访谈回复"}
        </button>
        <button
          className="button secondary"
          type="submit"
          name="operation"
          value="GENERATE_SPEC"
          disabled={pending}
        >
          {pending ? "处理中…" : "生成候选 Spec"}
        </button>
      </div>
    </form>
  );
}
