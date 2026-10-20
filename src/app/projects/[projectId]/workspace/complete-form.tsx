"use client";

import { useActionState } from "react";

import { completeProjectAction } from "@/app/actions/delivery";
import { initialDeliveryActionState } from "@/app/actions/delivery-state";

export function CompleteForm({ projectId }: { projectId: string }) {
  const action = completeProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialDeliveryActionState);
  return (
    <form action={formAction} className="mt-6 grid gap-3 border-t border-requester/20 pt-5">
      <p className="font-zh text-sm">所有里程碑已通过。确认后，项目进入已完成状态。</p>
      {state.message ? <p className="font-zh text-xs text-destructive" role="alert" data-error-code={state.errorCode}>{state.message}</p> : null}
      {state.successMessage ? <p className="font-zh text-xs text-requester" role="status">{state.successMessage}</p> : null}
      <button type="submit" disabled={pending} className="justify-self-start rounded-sm bg-requester px-4 py-2.5 font-zh text-xs text-white disabled:opacity-50">
        {pending ? "正在确认…" : "确认最终验收并完成项目"}
      </button>
    </form>
  );
}
