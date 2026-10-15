import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { DEMO_CURRENCY, describeBudget, formatMinorUnits } from "@/modules/projects/money";
import { getOwnProject } from "@/modules/projects/service";
import { projectIdSchema } from "@/modules/projects/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../project-header";
import { BudgetForm } from "./budget-form";
import { EditProjectForm } from "./edit-project-form";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  const parsedId = projectIdSchema.safeParse((await params).projectId);
  if (!parsedId.success) notFound();
  const project = await getOwnProject(userId, parsedId.data);
  if (!project) notFound();
  const saved = (await searchParams).saved === "1";
  const locked = project.lockedSpecVersionId !== null;
  const budget = describeBudget(project.budgetMinMinor, project.budgetMaxMinor, project.currency);
  const currency = project.currency ?? DEMO_CURRENCY;

  return (
    <main className="workspace-shell">
      <ProjectHeader />
      <section className="workspace-content">
        <Link className="back-link" href="/enterprise/projects">← 返回项目列表</Link>
        <div className="project-heading">
          <div>
            <p className="eyebrow">
              {project.status === "OPEN" ? "已发布" : "草稿"} · 版本 {project.version}
            </p>
            <h1 className="section-title">{project.title}</h1>
          </div>
          {/* Publishing locks the scope, so a published project stays locked:
              keep the annotation but never replace the real status with DRAFT. */}
          <span className="status-pill">
            {locked ? `${project.status} · 已锁定范围` : project.status}
          </span>
        </div>
        {saved ? <p className="form-message success" role="status">草稿已保存。</p> : null}
        {locked ? (
          <p className="form-message success" role="status">
            已锁定 Spec 版本：标题、原始需求与参考预算已冻结，不能再修改。
          </p>
        ) : null}
        <EditProjectForm project={project} />
        <nav className="step-links">
          <Link className="button button-link" href={`/enterprise/projects/${project.id}/spec`}>
            {locked ? "查看已锁定的 Spec" : "需求访谈与 Spec"}
          </Link>
          {locked ? (
            <Link className="button button-link" href={`/enterprise/projects/${project.id}/publish`}>
              企业定金与发布
            </Link>
          ) : null}
          <span className="spec-muted">
            {locked
              ? "锁定后不能再访谈、生成候选或另存版本；下一步是模拟企业定金。"
              : "先通过 Mock 访谈整理需求，保存并锁定 Spec，再发布招募。"}
          </span>
        </nav>

        <section className="project-form">
          <h2 className="subsection-title">参考预算（{currency}）</h2>
          {locked ? (
            <>
              <p>
                <strong>{budget}</strong>
              </p>
              <p className="spec-muted">
                参考预算随 Spec 版本一并冻结；招募视图会注明这是参考金额，不是成交价。
              </p>
            </>
          ) : (
            <BudgetForm
              projectId={project.id}
              version={project.version}
              minAmount={
                project.budgetMinMinor === null
                  ? ""
                  : formatMinorUnits(project.budgetMinMinor, currency)
              }
              maxAmount={
                project.budgetMaxMinor === null
                  ? ""
                  : formatMinorUnits(project.budgetMaxMinor, currency)
              }
            />
          )}
        </section>
      </section>
    </main>
  );
}
