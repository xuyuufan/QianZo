import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { getWorkspace } from "@/modules/workspace/service";
import { projectIdSchema } from "@/modules/projects/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "@/app/enterprise/projects/project-header";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeZone: "Asia/Shanghai",
});

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

type WorkspacePageProps = { params: Promise<{ projectId: string }> };

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE") && !actor.roles.includes("BUILDER")) redirect("/");

  const parsedProjectId = projectIdSchema.safeParse((await params).projectId);
  if (!parsedProjectId.success) notFound();
  const workspace = await getWorkspace(userId, parsedProjectId.data);
  if (!workspace) notFound();

  const role = actor.roles.includes("ENTERPRISE") ? "requester" : "builder";
  const homeHref = role === "requester" ? "/enterprise/projects" : "/projects";

  return (
    <div className="qz-paper min-h-[100svh]">
      <ProjectHeader
        label="项目 Workspace"
        homeHref={homeHref}
        role={role}
        fullBleed
        availableRoles={projectHeaderRoles(actor.roles)}
      />
      <main className="qz-rise mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <Link href={homeHref} className="font-zh text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
          ← 返回项目列表
        </Link>

        <header className="mt-7 flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Project Workspace</p>
            <h1 className="mt-3 break-words font-zh text-3xl font-normal sm:text-4xl">{workspace.title}</h1>
            <p className="mt-3 max-w-2xl font-zh text-sm leading-6 text-muted-foreground">
              当前工作范围来自已公开并锁定的 Spec；本地 Mock 押金不代表真实收付或合同接受。
            </p>
          </div>
          <div className="shrink-0 font-zh text-xs text-muted-foreground sm:text-right">
            <p>项目状态 · 进行中</p>
            <p className="mt-2">开工于 {dateTimeFormat.format(new Date(workspace.startedAt))}</p>
          </div>
        </header>

        <section className="mt-8" aria-labelledby="workspace-milestones-title">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Locked scope</p>
              <h2 id="workspace-milestones-title" className="mt-2 font-zh text-xl">项目里程碑</h2>
            </div>
            <span className="font-zh text-xs text-muted-foreground">{workspace.milestones.length} 个里程碑 · 按交付计划排列</span>
          </div>

          <ol className="divide-y divide-border border-y border-border">
            {workspace.milestones.map((milestone) => (
              <li key={milestone.id} className="grid gap-4 py-6 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
                <span className="font-brand text-xs text-muted-foreground">M{String(milestone.position).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-zh text-sm">{milestone.title}</h3>
                    <span className="font-zh text-[11px] text-muted-foreground">
                      {milestone.status === "IN_PROGRESS" ? "进行中" : "待开始"}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap font-zh text-sm leading-6 text-muted-foreground">{milestone.description}</p>

                  <div className="mt-5 grid gap-5 border-t border-border pt-4 md:grid-cols-2">
                    <section aria-label={`${milestone.title}交付物`}>
                      <h4 className="font-zh text-xs">交付物</h4>
                      {milestone.deliverables.length === 0 ? (
                        <p className="mt-2 font-zh text-xs text-muted-foreground">Spec 未列出交付物。</p>
                      ) : (
                        <ul className="mt-2 space-y-3">
                          {milestone.deliverables.map((deliverable, index) => (
                            <li key={`${milestone.id}-deliverable-${index}`} className="font-zh text-xs leading-5 text-muted-foreground">
                              <span className="text-foreground">{deliverable.title}</span>
                              {deliverable.description ? <span> · {deliverable.description}</span> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section aria-label={`${milestone.title}验收标准`}>
                      <h4 className="font-zh text-xs">验收标准与验证方法</h4>
                      {milestone.acceptanceCriteria.length === 0 ? (
                        <p className="mt-2 font-zh text-xs text-muted-foreground">Spec 未列出验收标准。</p>
                      ) : (
                        <ol className="mt-2 space-y-3">
                          {milestone.acceptanceCriteria.map((criterion, index) => (
                            <li key={`${milestone.id}-acceptance-${index}`} className="font-zh text-xs leading-5 text-muted-foreground">
                              <span className="text-foreground">{criterion.description}</span>
                              <span className="mt-1 block">验证方法：{criterion.verificationMethod}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                  </div>
                </div>
                <time dateTime={milestone.deadline} className="font-zh text-xs text-muted-foreground">
                  计划截止 {dateFormat.format(new Date(milestone.deadline))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
