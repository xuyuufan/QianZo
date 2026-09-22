"use client";

import { useActionState } from "react";

import { emptyProjectActionState } from "@/app/actions/project-state";
import { updateProjectAction } from "@/app/actions/projects";

type EditProjectFormProps = {
  project: {
    id: string;
    title: string;
    originalRequirement: string;
    version: number;
  };
};

export function EditProjectForm({ project }: EditProjectFormProps) {
  const action = updateProjectAction.bind(null, project.id);
  const [state, formAction, pending] = useActionState(action, emptyProjectActionState);

  return (
    <form action={formAction} className="project-form">
      <input name="expectedVersion" type="hidden" value={project.version} />
      <label className="field">
        <span>项目标题</span>
        <input
          name="title"
          type="text"
          defaultValue={project.title}
          minLength={1}
          maxLength={120}
          required
        />
      </label>
      <label className="field">
        <span>原始需求</span>
        <textarea
          name="originalRequirement"
          rows={12}
          defaultValue={project.originalRequirement}
          maxLength={10_000}
        />
      </label>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "正在保存…" : "保存草稿"}
      </button>
    </form>
  );
}
