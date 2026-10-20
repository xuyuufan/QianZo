"use client";

import { useActionState } from "react";

import { reviewDeliveryAction } from "@/app/actions/delivery";
import { initialDeliveryActionState } from "@/app/actions/delivery-state";

type ReviewFormProps = {
  projectId: string;
  milestoneId: string;
  submissionId: string;
  criteria: Array<{ description: string; verificationMethod: string }>;
};

export function ReviewForm({ projectId, milestoneId, submissionId, criteria }: ReviewFormProps) {
  const action = reviewDeliveryAction.bind(null, projectId, milestoneId, submissionId);
  const [state, formAction, pending] = useActionState(action, initialDeliveryActionState);
  return (
    <form action={formAction} className="mt-5 grid gap-4 border-t border-requester/20 pt-4">
      <h4 className="font-zh text-xs">逐条验收</h4>
      {criteria.map((criterion, index) => (
        <label key={index} className="grid gap-2 rounded-sm border border-border p-3 font-zh text-xs">
          <span>{index + 1}. {criterion.description}</span>
          <span className="text-muted-foreground">验证方法：{criterion.verificationMethod}</span>
          <select name="criterionResult" defaultValue={`${index + 1}:PASS`} className="w-fit rounded-sm border border-border bg-background px-3 py-2">
            <option value={`${index + 1}:PASS`}>PASS · 通过</option>
            <option value={`${index + 1}:FAIL`}>FAIL · 需返工</option>
          </select>
        </label>
      ))}
      <label className="grid gap-2 font-zh text-xs">
        返工原因（存在 FAIL 时必填）
        <textarea name="reason" maxLength={2000} rows={3} className="rounded-sm border border-border bg-background px-3 py-2 text-sm" />
      </label>
      {state.issues.length > 0 ? <ul className="font-zh text-xs text-destructive">{state.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
      {state.message ? <p className="font-zh text-xs text-destructive" role="alert" data-error-code={state.errorCode}>{state.message}</p> : null}
      {state.successMessage ? <p className="font-zh text-xs text-requester" role="status">{state.successMessage}</p> : null}
      <button type="submit" disabled={pending} className="justify-self-start rounded-sm border border-requester/40 px-4 py-2.5 font-zh text-xs disabled:opacity-50">
        {pending ? "正在保存…" : "保存验收结果"}
      </button>
    </form>
  );
}
