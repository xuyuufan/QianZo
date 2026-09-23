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

import { ProjectHeader } from "../../project-header";
import { AdoptCandidateForm } from "./adopt-candidate-form";
import { InterviewForm } from "./interview-form";
import { LockSpecForm } from "./lock-spec-form";
import { SpecEditorForm } from "./spec-editor-form";
import { SpecPreview } from "./spec-preview";

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

  // Any stored version can be reviewed; private history stays private.
  const requestedVersionId = (await searchParams).version;
  let viewed = current;
  if (requestedVersionId) {
    const parsedVersionId = specVersionIdSchema.safeParse(requestedVersionId);
    if (!parsedVersionId.success) notFound();
    viewed = versions.find((version) => version.id === parsedVersionId.data) ?? null;
    if (!viewed) notFound();
  }

  const candidateMessages = messages.filter((message) => message.payload?.result.specProposal);
  const latestCandidate =
    candidateMessages.length > 0 ? candidateMessages[candidateMessages.length - 1] : null;
  const latestProposal = latestCandidate?.payload?.result.specProposal ?? null;
  const adoptedVersion = latestCandidate
    ? (versions.find((version) => version.sourceMessageId === latestCandidate.id) ?? null)
    : null;
  const candidateMatchesProjectVersion =
    latestCandidate?.payload?.adoptableProjectVersion === project.version;

  const editorDocument = current?.document ?? latestProposal ?? emptySpecDraft(project);

  const locked = project.lockedSpecVersionId !== null;
  const budgetLabel = describeBudget(project.budgetMinMinor, project.budgetMaxMinor, project.currency);
  const lockedAt = project.lockedAt ? momentFormat.format(project.lockedAt) : null;

  return (
    <main className="workspace-shell">
      <ProjectHeader />
      <section className="workspace-content">
        <Link className="back-link" href={`/enterprise/projects/${project.id}`}>
          ← 返回项目总览
        </Link>
        <div className="project-heading">
          <div>
            <p className="eyebrow">
              需求访谈与 Spec · 项目版本 {project.version}
              {current ? ` · 当前 Spec 版本 ${current.versionNo}` : " · 尚未保存 Spec"}
              {locked ? " · 已锁定" : ""}
            </p>
            <h1 className="section-title">{project.title}</h1>
          </div>
          <span className="status-pill">{project.status}</span>
        </div>
        <p className="lede">
          访谈记录与 Spec 版本只有你和本项目的服务端入口能读取；发布前不会出现在招募视图中。
        </p>

        <section className="project-form">
          <h2 className="subsection-title">访谈记录</h2>
          {messages.length === 0 ? (
            <p className="spec-muted">还没有访谈记录。先说明需求，再让 Mock AIPM 提问。</p>
          ) : (
            <ol className="interview-thread">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.role === "USER"
                      ? "interview-message interview-message-user"
                      : "interview-message"
                  }
                  data-role={message.role}
                >
                  <p className="interview-role">
                    {message.role === "USER" ? "企业" : "Mock AIPM"} ·{" "}
                    {momentFormat.format(message.createdAt)}
                  </p>
                  <p className="interview-content">{message.content}</p>
                  {message.payload ? (
                    <p className="spec-muted">
                      {message.payload.result.completeness.readyForReview
                        ? "信息已足够进入审阅。"
                        : `还缺：${message.payload.result.completeness.missingInformation.join("、")}`}
                      {message.payload.result.specProposal
                        ? message.payload.adoptableProjectVersion === project.version
                          ? " · 候选可审阅（当前版本匹配）"
                          : " · 候选已过期，需要重新生成或手工另存"
                        : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="project-form">
          <h2 className="subsection-title">发起访谈或生成候选</h2>
          {locked ? (
            <p className="form-message success" role="status">
              Spec 已锁定，访谈与候选生成已关闭。已有的对话与历史版本仍可查看。
            </p>
          ) : (
            <InterviewForm projectId={project.id} version={project.version} />
          )}
        </section>

        {latestCandidate && latestProposal ? (
          <section className="project-form">
            <h2 className="subsection-title">最新候选 Spec</h2>
            {adoptedVersion ? (
              <p className="form-message success" role="status">
                该候选已采用为版本 {adoptedVersion.versionNo}，历史版本不会被覆盖。
              </p>
            ) : locked ? (
              <p className="form-message success" role="status">
                范围已锁定，这条候选不能再被采用，仅作为历史保留。
              </p>
            ) : candidateMatchesProjectVersion ? (
              <AdoptCandidateForm
                projectId={project.id}
                version={project.version}
                sourceMessageId={latestCandidate.id}
              />
            ) : (
              <p className="form-message error" role="alert" data-error-code="STALE_PROPOSAL">
                该候选基于更早的项目版本，已过期：请重新生成候选，或在下方手工编辑后另存为新版本。
              </p>
            )}
            <SpecPreview document={latestProposal} />
          </section>
        ) : null}

        <section className="project-form" data-testid="spec-version-detail">
          <h2 className="subsection-title">
            {viewed
              ? `Spec 版本 ${viewed.versionNo}${viewed.id === current?.id ? "（当前）" : "（历史）"}`
              : "Spec 版本"}
          </h2>
          {viewed?.document ? (
            <>
              <p className="spec-muted">
                {viewed.sourceMessageId ? "来源：采用候选" : "来源：手工保存"} ·{" "}
                {momentFormat.format(viewed.createdAt)}
                {viewed.id === current?.id ? "" : " · 这是历史版本，不会被修改"}
              </p>
              {requestedVersionId && requestedVersionId !== current?.id ? (
                <Link className="back-link" href={`/enterprise/projects/${project.id}/spec`}>
                  返回当前版本
                </Link>
              ) : null}
              <SpecPreview document={viewed.document} />
            </>
          ) : viewed ? (
            <p className="form-message error" role="alert">
              这个版本的内容无法通过结构校验，请手工另存一份可用版本。
            </p>
          ) : (
            <p className="spec-muted">
              还没有保存过 Spec 版本。可以采用上面的候选，或在下方手工编辑后保存。
            </p>
          )}
        </section>

        <section className="project-form">
          <h2 className="subsection-title">锁定评审范围</h2>
          {locked ? (
            <>
              <p className="form-message success" role="status">
                已锁定 Spec 版本 {current?.versionNo}
                {lockedAt ? `（${lockedAt}）` : ""}：标题、原始需求、参考预算
                {budgetLabel ? `（${budgetLabel}）` : ""}与当前版本已冻结，S1 不提供解锁。
              </p>
              <p className="spec-muted">
                <Link href={`/enterprise/projects/${project.id}/publish`}>
                  下一步：模拟企业定金并发布招募 →
                </Link>
              </p>
            </>
          ) : current ? (
            budgetLabel ? (
              <LockSpecForm
                projectId={project.id}
                version={project.version}
                specVersionId={current.id}
                budgetLabel={budgetLabel}
              />
            ) : (
              <p className="form-message error" role="alert" data-error-code="PAYMENT_REQUIRED">
                锁定前请先在{" "}
                <Link href={`/enterprise/projects/${project.id}`}>项目总览</Link>{" "}
                补齐参考预算上下限；锁定会同时冻结这些金额。
              </p>
            )
          ) : (
            <p className="spec-muted">还没有保存过 Spec 版本，先采用候选或手工另存一版再锁定。</p>
          )}
        </section>

        <section className="project-form">
          <h2 className="subsection-title">版本历史</h2>
          {versions.length === 0 ? (
            <p className="spec-muted">暂无版本记录。</p>
          ) : (
            <ul className="version-list">
              {versions.map((version) => (
                <li key={version.id}>
                  <Link href={`/enterprise/projects/${project.id}/spec?version=${version.id}`}>
                    版本 {version.versionNo}
                  </Link>
                  <span className="spec-muted">
                    {version.sourceMessageId ? "候选采用" : "手工保存"} ·{" "}
                    {momentFormat.format(version.createdAt)}
                    {version.id === current?.id ? " · 当前版本" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="project-form">
          <h2 className="subsection-title">手工编辑并保存新版本</h2>
          {locked ? (
            <p className="form-message success" role="status">
              范围已锁定，不能再另存新版本；如需调整范围，S1 不提供解锁流程。
            </p>
          ) : (
            <>
              <p className="spec-muted">
                保存永远新增版本，不覆盖历史。校验通过只会说明结构合法，不代表需求已经被确认。
              </p>
              <SpecEditorForm
                projectId={project.id}
                version={project.version}
                initialContent={JSON.stringify(editorDocument, null, 2)}
              />
            </>
          )}
        </section>
      </section>
    </main>
  );
}
