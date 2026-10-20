"use client";

import { useActionState } from "react";

import { emptyProjectActionState } from "@/app/actions/project-state";
import { updateProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";

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
    <form action={formAction} className="mt-5 space-y-4">
      <input name="expectedVersion" type="hidden" value={project.version} />
      <label className="block space-y-1.5 font-zh text-xs text-muted-foreground">
        <span className="block">项目标题</span>
        <input
          name="title"
          type="text"
          defaultValue={project.title}
          minLength={1}
          maxLength={120}
          required
          className="w-full rounded-sm border border-border bg-card px-3 py-2.5 font-zh text-sm text-foreground outline-none transition-colors focus:border-foreground"
        />
      </label>
      <label className="block space-y-1.5 font-zh text-xs text-muted-foreground">
        <span className="block">原始需求</span>
        <textarea
          name="originalRequirement"
          rows={12}
          defaultValue={project.originalRequirement}
          maxLength={10_000}
          className="min-h-32 w-full resize-y rounded-sm border border-border bg-card px-3 py-2.5 font-zh text-sm leading-6 text-foreground outline-none transition-colors focus:border-foreground"
        />
      </label>
      {state.message ? (
        <p className={`border px-4 py-3 font-zh text-xs ${state.errorCode ? "border-destructive/30 text-destructive" : "border-requester/30 text-foreground"}`} role={state.errorCode ? "alert" : "status"} data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="bg-foreground text-background hover:bg-foreground/90">
        {pending ? "正在保存…" : "保存草稿"}
      </Button>
    </form>
  );
}
