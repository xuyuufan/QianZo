"use client";

import { useActionState, useRef, useState } from "react";

import { emptyProjectActionState } from "@/app/actions/project-state";
import { createProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";

const exampleTitle = "健身房课程预约小程序";
const exampleRequirement = "我想做一个给健身房会员预约课程的小程序。会员可以按日期和教练查看课程、预约或取消；教练能管理排期，前台可以签到核销。希望首期支持微信登录和支付。";
const outlineStages = ["项目目标", "用户角色", "核心功能", "边界与验收"];

export function CreateProjectForm({ projectId }: { projectId: string }) {
  const action = createProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptyProjectActionState);
  const [title, setTitle] = useState("");
  const [requirement, setRequirement] = useState("");
  const requirementRef = useRef<HTMLTextAreaElement>(null);

  function fillExample() {
    setTitle(exampleTitle);
    setRequirement(exampleRequirement);
    requestAnimationFrame(() => requirementRef.current?.focus());
  }

  return (
    <section aria-labelledby="new-project-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">NEW PROJECT · 01</p>
          <h1 id="new-project-title" className="mt-2 font-zh text-3xl font-normal sm:text-4xl">有什么想做的项目？</h1>
          <p className="mt-3 font-zh text-sm text-muted-foreground">先保存标题和原始需求，再进入访谈整理可开发、可验收的 Spec。</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={fillExample} className="border-border bg-card font-zh text-xs shadow-none">
          填入示例
        </Button>
      </div>

      <form action={formAction} data-testid="new-project-form-grid" className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,.92fr)]">
        <div data-testid="new-project-input-panel" className="overflow-hidden rounded-md border border-border bg-card transition-colors focus-within:border-foreground">
          <label className="flex min-h-11 items-center gap-3 border-b border-border px-5 py-2">
            <span className="shrink-0 font-zh text-[11px] text-muted-foreground">项目标题</span>
            <input
              name="title"
              type="text"
              minLength={1}
              maxLength={120}
              required
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              className="min-w-0 flex-1 bg-transparent font-zh text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
              placeholder="为项目起一个名称"
              aria-label="项目标题"
            />
          </label>
          <label className="block">
            <span className="sr-only">原始需求</span>
            <textarea
              ref={requirementRef}
              name="originalRequirement"
              value={requirement}
              onChange={(event) => setRequirement(event.currentTarget.value)}
              rows={4}
              maxLength={10_000}
              aria-label="原始需求"
              placeholder="用自己的话描述想解决的问题、使用者和期望结果……"
              className="block min-h-32 w-full resize-none bg-transparent px-5 py-4 font-zh text-base leading-7 outline-none placeholder:text-muted-foreground/70"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="font-zh text-xs text-muted-foreground">{requirement.length} 字 · 草稿保存后进入需求访谈</span>
            <Button type="submit" size="sm" disabled={pending || !title.trim()} className="bg-foreground text-background hover:bg-foreground/90">
              {pending ? "正在创建…" : "创建草稿 →"}
            </Button>
          </div>
        </div>

        <div data-testid="new-project-outline" className="flex min-h-80 flex-col border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <span className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Spec outline</span>
          </div>
          <div className="grid grid-cols-4 border-b border-border">
            {outlineStages.map((stage, index) => (
              <div key={stage} className="relative px-2 py-3 text-center">
                <span className="mx-auto block size-2 rounded-full border border-border bg-card" />
                <span className="mt-2 block font-zh text-[10px] text-muted-foreground">{stage}</span>
                {index < outlineStages.length - 1 ? <span className="absolute left-1/2 right-0 top-4 h-px translate-x-1 bg-border" /> : null}
              </div>
            ))}
          </div>
          {state.message ? (
            <p className="m-4 border border-destructive/30 bg-background px-4 py-3 font-zh text-xs text-destructive" role="alert" data-error-code={state.errorCode ?? undefined}>
              {state.message}
            </p>
          ) : (
            <div className="grid min-h-48 flex-1 place-items-center px-6 py-8 text-center">
              <div>
                <p className="font-zh text-sm text-muted-foreground">保存草稿后，在需求访谈中逐步整理 Spec。</p>
                <p className="mt-2 font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Idea → structure → acceptance</p>
              </div>
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
