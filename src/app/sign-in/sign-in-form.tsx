"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signInAction } from "@/app/actions/auth";
import { emptyFormActionState } from "@/app/actions/form-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="登录"
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-3 font-zh text-sm text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "登录中…" : "登录 →"}
    </button>
  );
}

export function SignInForm({ intent }: { intent?: "requester" | "builder" }) {
  const [state, action] = useActionState(signInAction, emptyFormActionState);
  return (
    <form action={action} className="mt-7 grid gap-4 font-zh">
      {intent ? <input type="hidden" name="intent" value={intent} /> : null}
      <div>
        <label htmlFor="email" className="block text-xs text-foreground/80">邮箱</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          required
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs text-foreground/80">密码</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="请输入密码"
          required
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive"
        />
      </div>
      {state.message ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2 text-xs leading-5 text-destructive" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
      <p className="text-center text-[11px] text-muted-foreground">此登录仅支持已有账户。</p>
    </form>
  );
}
