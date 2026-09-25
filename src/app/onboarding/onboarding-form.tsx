"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { completeOnboardingAction } from "@/app/actions/auth";
import { emptyFormActionState } from "@/app/actions/form-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-3 font-zh text-sm text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "正在保存…" : "完成设置 →"}
    </button>
  );
}

export function OnboardingForm({
  defaultDisplayName = "",
  defaultRoles = [],
  intent,
}: {
  defaultDisplayName?: string;
  defaultRoles?: readonly ("ENTERPRISE" | "BUILDER")[];
  intent?: "requester" | "builder";
}) {
  const [state, action] = useActionState(completeOnboardingAction, emptyFormActionState);
  return (
    <form action={action} className="mt-7 grid gap-4 font-zh">
      {intent ? <input type="hidden" name="intent" value={intent} /> : null}
      <label htmlFor="displayName" className="block text-xs text-foreground/80">
        显示名
        <input
          id="displayName"
          name="displayName"
          type="text"
          minLength={1}
          maxLength={80}
          required
          defaultValue={defaultDisplayName}
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </label>
      <fieldset className="grid gap-2 border-0 p-0">
        <legend className="mb-1 text-xs text-foreground/80">参与身份</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            name="roles"
            type="checkbox"
            value="ENTERPRISE"
            defaultChecked={defaultRoles.includes("ENTERPRISE") || intent === "requester"}
            className="mt-1 accent-requester"
          />
          <span className="grid gap-1"><strong className="font-normal">企业</strong><small className="text-xs text-muted-foreground">创建和管理项目草稿</small></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            name="roles"
            type="checkbox"
            value="BUILDER"
            defaultChecked={defaultRoles.includes("BUILDER") || intent === "builder"}
            className="mt-1 accent-builder"
          />
          <span className="grid gap-1"><strong className="font-normal">Builder</strong><small className="text-xs text-muted-foreground">后续切片开放接单</small></span>
        </label>
      </fieldset>
      {state.message ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2 text-xs leading-5 text-destructive" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
