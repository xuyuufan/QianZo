import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getProjectInterview } from "@/modules/aipm/service";
import { getActorById } from "@/modules/identity/service";
import { describeBudget } from "@/modules/projects/money";
import { projectIdSchema } from "@/modules/projects/validation";
import { emptySpecDraft } from "@/modules/specs/draft";
import { getProjectSpecs } from "@/modules/specs/service";
import { specVersionIdSchema } from "@/modules/specs/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "../../project-header";
import { InterviewForm } from "./interview-form";
import { SpecReviewWorkspace } from "./spec-review-workspace";

export const dynamic = "force-dynamic";

type SpecPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ version?: string }>;
};

const momentFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function ProjectSpecPage({ params, searchParams }: SpecPageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  const parsedId = projectIdSchema.safeParse((await params).projectId);
  if (!parsedId.success) notFound();
  const projectId = parsedId.data;

  const interview = await getProjectInterview(userId, projectId);
  if (!interview) notFound();
  const history = await getProjectSpecs(userId, projectId);
  if (!history) notFound();

  const project = history.project;
  const { messages } = interview;
  const { current, versions } = history;
  const requestedVersionId = (await searchParams).version;
  let initialHistoryVersionId: string | null = null;
  if (requestedVersionId) {
    const parsedVersionId = specVersionIdSchema.safeParse(requestedVersionId);
    if (!parsedVersionId.success) notFound();
    const requestedVersion = versions.find((version) => version.id === parsedVersionId.data);
    if (!requestedVersion) notFound();
    initialHistoryVersionId = requestedVersion.id;
  }

  const candidateMessages = messages.filter((message) => message.payload?.result.specProposal);
  const latestCandidate = candidateMessages.at(-1) ?? null;
  const latestProposal = latestCandidate?.payload?.result.specProposal ?? null;
  const adoptedVersion = latestCandidate
    ? versions.find((version) => version.sourceMessageId === latestCandidate.id) ?? null
    : null;
  const candidateMatchesProjectVersion = latestCandidate?.payload?.adoptableProjectVersion === project.version;
  const editorDocument = current?.document ?? latestProposal ?? emptySpecDraft(project);
  const locked = project.lockedSpecVersionId !== null;
  const budgetLabel = describeBudget(project.budgetMinMinor, project.budgetMaxMinor, project.currency);
  const lockedAt = project.lockedAt ? momentFormat.format(project.lockedAt) : null;

  return (
    <main className="qz-paper min-h-[100svh]">
      <ProjectHeader fullBleed availableRoles={projectHeaderRoles(actor.roles)} />
      <section className="qz-rise mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          className="mb-8 inline-flex items-center gap-2 font-zh text-xs text-muted-foreground transition-colors hover:text-foreground"
          href={`/enterprise/projects/${project.id}`}
        >
          ← 返回项目总览
        </Link>

        <header className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Requester workspace · {project.id}
            </p>
            <h1 className="mt-3 break-words font-zh text-3xl font-normal sm:text-4xl">{project.title}</h1>
            <p className="mt-3 max-w-2xl font-zh text-sm leading-6 text-muted-foreground">
              持久化需求访谈与结构化项目范围。候选、当前版本和只读历史在同一工作区切换查看。
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-4 font-zh text-xs sm:gap-6 sm:text-right">
            <span><b className="mb-1 block font-normal text-muted-foreground">项目</b>{project.status === "OPEN" ? "招募中" : "草稿"}</span>
            <span><b className="mb-1 block font-normal text-muted-foreground">Spec</b>{current ? `当前 Spec 版本 ${current.versionNo}` : "未保存"}</span>
            <span><b className="mb-1 block font-normal text-muted-foreground">范围</b>{locked ? "已锁定" : "编辑中"}</span>
          </div>
        </header>

        <div className="spec-workspace-grid mt-8">
          <aside className="spec-interview-column" aria-label="需求访谈">
            <section className="spec-interview-transcript border border-border bg-card p-5 sm:p-6">
              <div className="spec-panel-heading mb-5">
                <div>
                  <p className="mb-2 font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Discovery</p>
                  <h2 className="font-zh text-base font-normal">需求访谈</h2>
                </div>
                <span className="font-brand text-[10px] text-muted-foreground">{messages.length} 条记录</span>
              </div>
              {messages.length === 0 ? (
                <p className="border-y border-border py-4 font-zh text-sm leading-6 text-muted-foreground">
                  还没有访谈记录。先说明需求，再让 Mock AIPM 提问。
                </p>
              ) : (
                <ol className="interview-thread">
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className={message.role === "USER" ? "interview-message interview-message-user" : "interview-message"}
                      data-role={message.role}
                    >
                      <p className="interview-role">
                        {message.role === "USER" ? "企业" : "Mock AIPM"} · {momentFormat.format(message.createdAt)}
                      </p>
                      <p className="interview-content">{message.content}</p>
                      {message.payload ? (
                        <p className="mt-3 font-zh text-xs leading-5 text-muted-foreground">
                          {message.payload.result.completeness.readyForReview
                            ? "信息已足够进入审阅。"
                            : `还缺：${message.payload.result.completeness.missingInformation.join("、")}`}
                          {message.payload.result.specProposal
                            ? message.payload.adoptableProjectVersion === project.version
                              ? " · 候选可审阅"
                              : " · 候选已过期"
                            : ""}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="spec-interview-compose border border-border bg-card p-5 sm:p-6">
              <div className="mb-5">
                <p className="mb-2 font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Mock AIPM</p>
                <h2 className="font-zh text-base font-normal">继续访谈</h2>
              </div>
              {locked ? (
                <p className="border-y border-border py-4 font-zh text-sm leading-6 text-muted-foreground" role="status">
                  Spec 已锁定，访谈与候选生成已关闭。已有对话与历史版本仍可查看。
                </p>
              ) : (
                <InterviewForm projectId={project.id} version={project.version} />
              )}
            </section>
          </aside>

          <div className="spec-editor-column">
            <SpecReviewWorkspace
              projectId={project.id}
              projectVersion={project.version}
              projectTitle={project.title}
              originalRequirement={project.originalRequirement}
              budgetLabel={budgetLabel}
              lockedAt={lockedAt}
              locked={locked}
              current={current ? {
                id: current.id,
                versionNo: current.versionNo,
                sourceMessageId: current.sourceMessageId,
                createdAt: current.createdAt.toISOString(),
                document: current.document,
              } : null}
              versions={versions.map((version) => ({
                id: version.id,
                versionNo: version.versionNo,
                sourceMessageId: version.sourceMessageId,
                createdAt: version.createdAt.toISOString(),
                document: version.document,
              }))}
              candidate={latestCandidate && latestProposal ? {
                sourceMessageId: latestCandidate.id,
                createdAt: latestCandidate.createdAt.toISOString(),
                document: latestProposal,
              } : null}
              candidateMatchesProjectVersion={candidateMatchesProjectVersion}
              candidateAdoptedVersionNo={adoptedVersion?.versionNo ?? null}
              initialHistoryVersionId={initialHistoryVersionId}
              editorDocument={editorDocument}
            />
          </div>
        </div>

      </section>
    </main>
  );
}
