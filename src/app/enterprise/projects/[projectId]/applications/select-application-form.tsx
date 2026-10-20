"use client";

import { useActionState } from "react";

import { selectApplicationAction } from "@/app/actions/applications";
import { emptyApplicationActionState } from "@/app/actions/application-state";
import { Button } from "@/components/ui/button";

export function SelectApplicationForm({
  projectId,
  applicationId,
  expectedVersion,
}: {
  projectId: string;
  applicationId: string;
  expectedVersion: number;
}) {
  const action = selectApplicationAction.bind(null, projectId, applicationId);
  const [state, formAction, pending] = useActionState(action, emptyApplicationActionState);
  return (
    <form action={formAction} className="grid justify-items-start gap-2">
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      {state.message ? <p className="font-zh text-xs text-destructive" role="alert" data-error-code={state.errorCode ?? undefined}>{state.message}</p> : null}
      {state.successMessage ? <p className="font-zh text-xs text-requester" role="status">{state.successMessage}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="bg-foreground text-background hover:bg-foreground/90">
        {pending ? "正在选择…" : "选择 Builder"}
      </Button>
    </form>
  );
}
