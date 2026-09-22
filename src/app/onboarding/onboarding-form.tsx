"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { completeOnboardingAction } from "@/app/actions/auth";
import { emptyFormActionState } from "@/app/actions/form-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "正在保存…" : "完成设置"}
    </button>
  );
}

export function OnboardingForm() {
  const [state, action] = useActionState(completeOnboardingAction, emptyFormActionState);
  return (
    <form action={action} className="form-stack">
      <label className="field">
        <span>显示名</span>
        <input name="displayName" type="text" minLength={1} maxLength={80} required />
      </label>
      <fieldset className="role-fieldset">
        <legend>参与身份</legend>
        <label className="choice-card">
          <input name="roles" type="checkbox" value="ENTERPRISE" />
          <span><strong>企业</strong><small>创建和管理项目草稿</small></span>
        </label>
        <label className="choice-card">
          <input name="roles" type="checkbox" value="BUILDER" />
          <span><strong>Builder</strong><small>后续切片开放接单</small></span>
        </label>
      </fieldset>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
