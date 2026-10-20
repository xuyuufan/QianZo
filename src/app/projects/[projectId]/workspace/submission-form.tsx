"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { submitDeliveryAction } from "@/app/actions/delivery";
import { initialDeliveryActionState } from "@/app/actions/delivery-state";

type SubmissionFormProps = {
  projectId: string;
  milestoneId: string;
  currentSubmissionId: string | null;
};

export function SubmissionForm({ projectId, milestoneId, currentSubmissionId }: SubmissionFormProps) {
  const action = submitDeliveryAction.bind(null, projectId, milestoneId);
  const [state, formAction, pending] = useActionState(action, initialDeliveryActionState);
  const submissionKeyInput = useRef<HTMLInputElement>(null);
  const [links, setLinks] = useState([""]);
  const submittedSinceAttempt = useRef(false);
  // A changed current pointer means the previous delivery was reviewed and
  // this form is a new intent. The same baseline retains the key for retries.
  const storageKey = `qianzo:s3:submission:${projectId}:${milestoneId}:${currentSubmissionId ?? "initial"}`;

  const persistKey = useCallback((key: string) => {
    try {
      window.sessionStorage.setItem(storageKey, key);
    } catch {
      // The key still protects this mounted form when browser storage is off.
    }
    if (submissionKeyInput.current) submissionKeyInput.current.value = key;
  }, [storageKey]);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.sessionStorage.getItem(storageKey);
    } catch {
      // Browsers can deny storage access before getItem is called.
    }
    const key = saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)
      ? saved
      : crypto.randomUUID();
    persistKey(key);
  }, [persistKey, storageKey]);

  function addLink() {
    if (links.length < 10) setLinks((current) => [...current, ""]);
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        if (!submissionKeyInput.current?.value) persistKey(crypto.randomUUID());
        submittedSinceAttempt.current = true;
      }}
      onChange={() => {
        if (submittedSinceAttempt.current) {
          persistKey(crypto.randomUUID());
          submittedSinceAttempt.current = false;
        }
      }}
      className="mt-6 grid gap-4 border-t border-border pt-5"
    >
      <input ref={submissionKeyInput} type="hidden" name="submissionKey" defaultValue="" />
      <input type="hidden" name="expectedCurrentSubmissionId" value={currentSubmissionId ?? ""} readOnly />
      <label className="grid gap-2 font-zh text-xs">
        本轮交付说明
        <textarea name="summary" required maxLength={4000} rows={4} className="min-h-24 rounded-sm border border-border bg-background px-3 py-2 text-sm" />
      </label>
      <fieldset className="grid gap-3">
        <legend className="font-zh text-xs">Repo / Demo 链接（HTTP 或 HTTPS）</legend>
        {links.map((value, index) => (
          <div key={index} className="flex gap-2">
            <input
              aria-label={`成果链接 ${index + 1}`}
              name="link"
              type="url"
              required={index === 0}
              maxLength={2048}
              value={value}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setLinks((current) => current.map((item, at) => at === index ? value : item));
              }}
              placeholder="https://example.com/repository"
              className="min-w-0 flex-1 rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs"
            />
            {index > 0 ? <button type="button" className="font-zh text-xs underline" onClick={() => setLinks((current) => current.filter((_, at) => at !== index))}>移除</button> : null}
          </div>
        ))}
        {links.length < 10 ? <button type="button" className="justify-self-start font-zh text-xs underline" onClick={addLink}>＋ 添加链接</button> : null}
      </fieldset>
      {state.issues.length > 0 ? <ul className="font-zh text-xs text-destructive">{state.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
      {state.message ? <p className="font-zh text-xs text-destructive" role="alert" data-error-code={state.errorCode}>{state.message}</p> : null}
      {state.successMessage ? <p className="font-zh text-xs text-builder" role="status">{state.successMessage}</p> : null}
      <button type="submit" disabled={pending} className="justify-self-start rounded-sm bg-foreground px-4 py-2.5 font-zh text-xs text-background disabled:opacity-50">
        {pending ? "正在提交…" : "提交成果链接"}
      </button>
      <p className="font-zh text-[11px] text-muted-foreground">每次返工都会新建一条历史记录；平台只保存链接，不会访问链接地址或抓取内容。</p>
    </form>
  );
}
