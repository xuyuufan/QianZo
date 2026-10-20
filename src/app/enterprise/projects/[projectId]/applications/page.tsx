import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { listProjectApplications } from "@/modules/applications/service";
import { ApplicationError } from "@/modules/applications/errors";
import { projectIdSchema } from "@/modules/projects/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "../../project-header";
import { SelectApplicationForm } from "./select-application-form";

export const dynamic = "force-dynamic";

type ApplicationsPageProps = { params: Promise<{ projectId: string }> };

export default async function ProjectApplicationsPage({ params }: ApplicationsPageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  const parsed = projectIdSchema.safeParse((await params).projectId);
  if (!parsed.success) notFound();
  let result: Awaited<ReturnType<typeof listProjectApplications>>;
  try {
    result = await listProjectApplications(userId, parsed.data);
  } catch (error) {
    // Missing and non-owned projects have the same page-level response.
    if (error instanceof ApplicationError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="qz-paper min-h-[100svh]">
      <ProjectHeader label="项目申请" fullBleed availableRoles={projectHeaderRoles(actor.roles)} />
      <main className="qz-rise mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <Link href={`/enterprise/projects/${parsed.data}`} className="font-zh text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">← 返回项目</Link>
        <header className="mt-7 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Project applications</p>
            <h1 className="mt-3 font-zh text-3xl font-normal sm:text-4xl">申请列表</h1>
            <p className="mt-3 font-zh text-sm text-muted-foreground">仅展示此项目收到的申请；申请人状态由服务端再次核验。</p>
          </div>
          <span className="font-zh text-xs text-muted-foreground" data-testid="project-application-count">{result.applications.length} 份申请</span>
        </header>

        {result.projectStatus === "AWAITING_BUILDER" ? (
          <p className="mt-6 border border-requester/30 bg-card px-4 py-3 font-zh text-sm" role="status">已选择 Builder，等待其完成 Mock 押金。当前不提供押金或开工操作。</p>
        ) : null}
        {result.projectStatus === "IN_PROGRESS" || result.projectStatus === "FINAL_REVIEW" || result.projectStatus === "COMPLETED" ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-requester/30 bg-card px-4 py-3">
            <p className="font-zh text-sm" role="status">
              {result.projectStatus === "COMPLETED" ? "项目已完成，交付历史仍可查看。" : result.projectStatus === "FINAL_REVIEW" ? "全部里程碑已通过，项目等待最终确认。" : "Builder 已完成 Mock 押金，项目已开工。"}
            </p>
            <Link
              href={`/projects/${result.projectId}/workspace`}
              className="font-zh text-xs text-foreground underline decoration-border underline-offset-4 hover:text-requester"
            >
              进入 Workspace →
            </Link>
          </div>
        ) : null}

        {result.applications.length === 0 ? (
          <p className="py-16 text-center font-zh text-sm text-muted-foreground">目前还没有申请。</p>
        ) : (
          <ul className="mt-8 grid gap-4">
            {result.applications.map((application) => {
              const selected = result.selectedApplicationId === application.id;
              const statusLabel = selected
                ? application.status === "ENGAGED" || result.projectStatus === "IN_PROGRESS" || result.projectStatus === "FINAL_REVIEW" || result.projectStatus === "COMPLETED"
                  ? result.projectStatus === "COMPLETED" ? "项目已完成" : result.projectStatus === "FINAL_REVIEW" ? "最终验收中" : "已开工"
                  : "已选择 · 等待 Builder Mock 押金"
                : application.status === "SUBMITTED"
                  ? "已提交"
                  : application.status === "REJECTED"
                    ? "未被选择"
                    : application.status === "ENGAGED"
                      ? "已开工"
                      : "状态更新中";
              return (
                <li key={application.id} className="grid gap-5 rounded-md border border-border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:p-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-zh text-base font-normal">{application.displayName}</h2>
                      <span className="font-zh text-xs text-muted-foreground" data-testid="application-status">{statusLabel}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap font-zh text-sm leading-6 text-muted-foreground">{application.statement}</p>
                  </div>
                  {selected ? <span className="font-zh text-xs text-requester">当前已选 Builder</span> :
                    result.projectStatus === "OPEN" && application.status === "SUBMITTED" ? (
                      <SelectApplicationForm
                        projectId={result.projectId}
                        applicationId={application.id}
                        expectedVersion={result.version}
                      />
                    ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
