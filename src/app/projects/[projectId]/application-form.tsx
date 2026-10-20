"use client";

import { useActionState } from "react";

import { applyToProjectAction } from "@/app/actions/applications";
import { emptyApplicationActionState } from "@/app/actions/application-state";
import { Button } from "@/components/ui/button";

export function ApplicationForm({ projectId }: { projectId: string }) {
  const action = applyToProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptyApplicationActionState);

  return (
    <form action={formAction} className="mt-5 grid gap-3" data-testid="application-form">
      <label htmlFor="application-statement" className="font-zh text-xs text-foreground/80">
        简要介绍你适合这个项目的经验
        <textarea
          id="application-statement"
          name="statement"
          required
          maxLength={2000}
          rows={5}
          className="mt-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 font-zh text-sm leading-6 outline-none transition-colors focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </label>
      {state.message ? (
        <p className="font-zh text-xs leading-5 text-destructive" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      {state.issues.length ? (
        <ul className="grid gap-1 font-zh text-xs leading-5 text-destructive">
          {state.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}
      {state.successMessage ? <p className="font-zh text-xs text-builder" role="status">{state.successMessage}</p> : null}
      <Button type="submit" disabled={pending} className="w-fit bg-builder text-white hover:bg-builder/90">
        {pending ? "正在提交…" : "提交申请"}
      </Button>
    </form>
  );
}
