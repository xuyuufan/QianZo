import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getProjectInterview } from "@/modules/aipm/service";
import { getActorById } from "@/modules/identity/service";
import { projectIdSchema } from "@/modules/projects/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../../project-header";
import { InterviewForm } from "./interview-form";
import { SpecPreview } from "./spec-preview";

export const dynamic = "force-dynamic";

type SpecPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectSpecPage({ params }: SpecPageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  const parsedId = projectIdSchema.safeParse((await params).projectId);
  if (!parsedId.success) notFound();
  const interview = await getProjectInterview(userId, parsedId.data);
  if (!interview) notFound();

  const { project, messages } = interview;
  const candidateMessages = messages.filter((message) => message.payload?.result.specProposal);
  const latestCandidate = candidateMessages.length > 0 ? candidateMessages[candidateMessages.length - 1] : null;
  const latestProposal = latestCandidate?.payload?.result.specProposal ?? null;

  return (
    <main className="workspace-shell">
      <ProjectHeader />
      <section className="workspace-content">
        <Link className="back-link" href={`/enterprise/projects/${project.id}`}>
          ← 返回项目总览
        </Link>
        <div className="project-heading">
          <div>
            <p className="eyebrow">需求访谈 · 项目版本 {project.version}</p>
            <h1 className="section-title">{project.title}</h1>
          </div>
          <span className="status-pill">{project.status}</span>
        </div>
        <p className="lede">
          访谈记录与候选 Spec 只有你和本项目的服务端入口能读取；发布前不会出现在招募视图中。
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
                  className={message.role === "USER" ? "interview-message interview-message-user" : "interview-message"}
                  data-role={message.role}
                >
                  <p className="interview-role">{message.role === "USER" ? "企业" : "Mock AIPM"}</p>
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
          <InterviewForm projectId={project.id} version={project.version} />
        </section>

        {latestProposal ? (
          <section className="project-form">
            <h2 className="subsection-title">最新候选 Spec（只读预览）</h2>
            <SpecPreview document={latestProposal} />
          </section>
        ) : null}
      </section>
    </main>
  );
}
