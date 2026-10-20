import Link from "next/link";
import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { listOwnApplications } from "@/modules/applications/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "../../enterprise/projects/project-header";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function BuilderApplicationsPage() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("BUILDER")) redirect("/projects");

  const applications = await listOwnApplications(userId);

  return (
    <div className="qz-paper min-h-[100svh]">
      <ProjectHeader label="我的申请" homeHref="/projects" fullBleed availableRoles={projectHeaderRoles(actor.roles)} />
      <main className="qz-rise mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Builder applications</p>
            <h1 className="mt-3 font-zh text-3xl font-normal sm:text-4xl">我的申请</h1>
            <p className="mt-3 font-zh text-sm text-muted-foreground">只显示你提交的申请和已公开项目标题。</p>
          </div>
          <Link href="/projects" className="font-zh text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">返回项目大厅</Link>
        </header>

        {applications.length === 0 ? (
          <p className="py-16 text-center font-zh text-sm text-muted-foreground">还没有提交申请。</p>
        ) : (
          <ul className="mt-8 grid gap-4">
            {applications.map((application) => {
              const selected = application.applicationStatus === "SELECTED";
              const status = application.applicationStatus === "SELECTED"
                ? "已被选择 · 等待 Mock 押金"
                : application.applicationStatus === "ENGAGED"
                  ? "已开工"
                  : application.applicationStatus === "REJECTED"
                    ? "未被选择"
                    : application.projectStatus === "AWAITING_BUILDER"
                      ? "申请仍在提交状态 · 项目已进入等待 Builder 阶段"
                      : "等待企业选择";
              return (
                <li key={application.applicationId} className="rounded-md border border-border bg-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-zh text-lg font-normal">{application.title}</h2>
                      <p className="mt-2 font-zh text-xs text-muted-foreground">提交于 {dateFormat.format(application.appliedAt)}</p>
                    </div>
                    <span className={`font-zh text-xs ${selected ? "text-builder" : "text-muted-foreground"}`} data-testid="application-status">
                      {status}
                    </span>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 font-zh text-sm leading-6 text-muted-foreground">{application.statement}</p>
                  <p className="mt-4 font-zh text-[11px] leading-5 text-muted-foreground">
                    {selected ? "企业已选中你；Mock 押金和开工将在后续步骤处理。" : "本页只显示你的申请，不公开项目的私有需求或完整 Spec。"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
