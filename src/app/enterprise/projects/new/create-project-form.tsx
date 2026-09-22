"use client";

import { useActionState } from "react";

import { emptyProjectActionState } from "@/app/actions/project-state";
import { createProjectAction } from "@/app/actions/projects";

export function CreateProjectForm({ projectId }: { projectId: string }) {
  const action = createProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptyProjectActionState);

  return (
    <form action={formAction} className="project-form">
      <label className="field">
        <span>项目标题</span>
        <input name="title" type="text" minLength={1} maxLength={120} required />
      </label>
      <label className="field">
        <span>原始需求</span>
        <textarea name="originalRequirement" rows={12} maxLength={10_000} />
      </label>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "正在创建…" : "创建草稿"}
      </button>
    </form>
  );
}
