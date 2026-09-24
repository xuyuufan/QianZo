"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signInAction } from "@/app/actions/auth";
import { emptyFormActionState } from "@/app/actions/form-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "正在登录…" : "登录"}
    </button>
  );
}

export function SignInForm({ intent }: { intent?: "requester" | "builder" }) {
  const [state, action] = useActionState(signInAction, emptyFormActionState);
  return (
    <form action={action} className="form-stack">
      {intent ? <input type="hidden" name="intent" value={intent} /> : null}
      <label className="field">
        <span>邮箱</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        <span>密码</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
