import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { enterpriseDeposit } from "@/modules/payments/mock-provider";
import { getProjectPayment } from "@/modules/payments/service";
import { describeAmount, describeBudget } from "@/modules/projects/money";
import { projectIdSchema } from "@/modules/projects/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../../project-header";
import { DepositForm } from "./deposit-form";

export const dynamic = "force-dynamic";

type PublishPageProps = {
  params: Promise<{ projectId: string }>;
};

const momentFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function ProjectPublishPage({ params }: PublishPageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  const parsedId = projectIdSchema.safeParse((await params).projectId);
  if (!parsedId.success) notFound();
  const state = await getProjectPayment(userId, parsedId.data);
  if (!state) notFound();

  const { project, payment } = state;
  const locked = project.lockedSpecVersionId !== null;
  const budget = describeBudget(project.budgetMinMinor, project.budgetMaxMinor, project.currency);

  return (
    <main className="workspace-shell">
      <ProjectHeader />
      <section className="workspace-content">
        <Link className="back-link" href={`/enterprise/projects/${project.id}`}>
          ← 返回项目总览
        </Link>
        <div className="project-heading">
          <div>
            <p className="eyebrow">企业定金与发布 · 项目版本 {project.version}</p>
            <h1 className="section-title">{project.title}</h1>
          </div>
          <span className="status-pill">{project.status}</span>
        </div>

        {locked ? (
          <section className="project-form">
            <h2 className="subsection-title">已锁定的范围</h2>
            <p className="spec-muted">
              参考预算 {budget ?? "未填写"} · 锁定时间{" "}
              {project.lockedAt ? momentFormat.format(project.lockedAt) : "—"}
            </p>
            <Link className="back-link" href={`/enterprise/projects/${project.id}/spec`}>
              查看已锁定的 Spec 版本
            </Link>
          </section>
        ) : (
          <p className="form-message error" role="alert" data-error-code="SPEC_LOCKED">
            发布前需要先锁定 Spec 范围：请到{" "}
            <Link href={`/enterprise/projects/${project.id}/spec`}>需求访谈与 Spec</Link>{" "}
            保存并锁定一个版本，再补齐参考预算。
          </p>
        )}

        {locked ? (
          <section className="project-form">
            <h2 className="subsection-title">企业 Mock 定金</h2>
            <DepositForm
              projectId={project.id}
              fixtureAmount={describeAmount(enterpriseDeposit.amountMinor, enterpriseDeposit.currency)}
              payment={
                payment
                  ? {
                      id: payment.id,
                      status: payment.status === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
                      amount: describeAmount(payment.amountMinor, payment.currency),
                      createdAt: momentFormat.format(payment.createdAt),
                      succeededAt: payment.succeededAt
                        ? momentFormat.format(payment.succeededAt)
                        : null,
                    }
                  : null
              }
            />
          </section>
        ) : null}
      </section>
    </main>
  );
}
