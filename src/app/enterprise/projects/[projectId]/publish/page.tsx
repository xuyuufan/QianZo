import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { enterpriseDeposit } from "@/modules/payments/mock-provider";
import { getProjectPayment } from "@/modules/payments/service";
import { describeAmount, describeBudget } from "@/modules/projects/money";
import { projectIdSchema } from "@/modules/projects/validation";
import { getProjectSpecs } from "@/modules/specs/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "../../project-header";
import { DepositForm } from "./deposit-form";
import { PublishForm } from "./publish-form";

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
  const projectId = parsedId.data;

  const state = await getProjectPayment(userId, projectId);
  if (!state) notFound();
  const { project, payment } = state;

  const specs = await getProjectSpecs(userId, projectId);
  if (!specs) notFound();
  const lockedVersion = specs.versions.find((version) => version.id === project.lockedSpecVersionId) ?? null;

  const locked = project.lockedSpecVersionId !== null;
  const published = project.status === "OPEN" || project.status === "AWAITING_BUILDER" || project.status === "IN_PROGRESS";
  const awaitingBuilder = project.status === "AWAITING_BUILDER";
  const inProgress = project.status === "IN_PROGRESS";
  const budget = describeBudget(project.budgetMinMinor, project.budgetMaxMinor, project.currency);
  const depositSucceeded = payment?.status === "SUCCEEDED";

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
              Publish workflow · project v{project.version}
            </p>
            <h1 className="mt-3 break-words font-zh text-3xl font-normal sm:text-4xl">{project.title}</h1>
            <p className="mt-3 max-w-2xl font-zh text-sm leading-6 text-muted-foreground">
              锁定范围、完成企业 Mock 定金，再检查脱敏后的对外 Spec 并确认发布。
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-zh text-xs text-muted-foreground">
            <span>状态 {inProgress ? "进行中" : awaitingBuilder ? "等待 Builder Mock 押金" : published ? "招募中" : locked ? "范围已锁定" : "草稿"}</span>
            <span>参考预算 {budget ?? "未填写"}</span>
          </div>
        </header>

        <ol className="mt-7 grid border-y border-border sm:grid-cols-3" aria-label="发布步骤">
          {[
            { number: "01", label: "确认并锁定 Spec", complete: locked },
            { number: "02", label: "企业 Mock 定金", complete: depositSucceeded },
            { number: "03", label: "脱敏预览与发布", complete: published },
          ].map((step, index) => (
            <li key={step.number} className={`flex items-center gap-3 py-4 font-zh text-xs ${index ? "sm:border-l sm:border-border sm:pl-5" : ""}`}>
              <span className={`font-brand text-[10px] ${step.complete ? "text-builder" : "text-muted-foreground"}`}>{step.number}</span>
              <span className={step.complete ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
              {step.complete ? <span className="ml-auto font-brand text-[9px] uppercase tracking-[0.12em] text-builder">Done</span> : null}
            </li>
          ))}
        </ol>

        <div className="publish-workflow-grid mt-9">
          <aside className="min-w-0">
            {locked ? (
              <section className="border border-border bg-card p-5 sm:p-6">
                <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Locked scope</p>
                <h2 className="mt-2 font-zh text-lg font-normal">已锁定的范围</h2>
                <p className="mt-4 font-zh text-sm leading-6">
                  Spec v{lockedVersion?.versionNo ?? "—"} · 参考预算 {budget ?? "未填写"}
                </p>
                <p className="mt-2 font-zh text-xs text-muted-foreground">
                  锁定时间 {project.lockedAt ? momentFormat.format(project.lockedAt) : "—"}
                </p>
                <Link
                  className="mt-5 inline-flex border-t border-border pt-4 font-zh text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                  href={`/enterprise/projects/${project.id}/spec`}
                >
                  查看锁定版本和 Spec 历史 →
                </Link>
              </section>
            ) : (
              <section className="border-y border-border py-5">
                <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Locked scope</p>
                <h2 className="mt-2 font-zh text-lg font-normal">发布前需要锁定 Spec</h2>
                <p className="mt-3 font-zh text-xs leading-5 text-muted-foreground">
                  保存一份 Spec、补齐参考预算并确认后，再进入 Mock 定金与发布流程。
                </p>
                <Link className="mt-4 inline-flex font-zh text-xs text-foreground underline decoration-border underline-offset-4" href={`/enterprise/projects/${project.id}/spec`}>
                  返回需求访谈与 Spec →
                </Link>
              </section>
            )}

            {locked && !inProgress ? (
              <section className="mt-8 border-t border-border pt-6">
                <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Mock payment</p>
                <h2 className="mt-2 font-zh text-lg font-normal">企业 Mock 定金</h2>
                <p className="mt-2 font-zh text-xs leading-5 text-muted-foreground">
                  金额由服务端演示 fixture 决定。付款只满足发布前置条件，不代表真实收付或合同接受。
                </p>
                <div className="mt-4 border border-border bg-card p-5 sm:p-6">
                  <DepositForm
                    projectId={project.id}
                    fixtureAmount={describeAmount(enterpriseDeposit.amountMinor, enterpriseDeposit.currency)}
                    payment={payment ? {
                      id: payment.id,
                      status: payment.status === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
                      amount: describeAmount(payment.amountMinor, payment.currency),
                      createdAt: momentFormat.format(payment.createdAt),
                      succeededAt: payment.succeededAt ? momentFormat.format(payment.succeededAt) : null,
                    } : null}
                  />
                </div>
              </section>
            ) : null}
          </aside>

          <section className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {published ? (
              <div data-testid="publish-result">
                <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-builder">Published</p>
                <h2 className="mt-2 font-zh text-xl font-normal">已发布</h2>
                <p className="mt-4 max-w-xl font-zh text-sm leading-6" role="status">
                  {inProgress ? "Builder 已完成本地模拟押金，项目已开工。" : awaitingBuilder ? "企业已选定 Builder，项目等待 Mock 押金后开工。" : "项目状态为 OPEN"}，发布于 {project.publishedAt ? momentFormat.format(project.publishedAt) : "—"}。S1 不提供下架或修改已公开内容的动作。
                </p>
                <Link className="mt-6 inline-flex border border-border px-4 py-2.5 font-zh text-xs transition-colors hover:border-foreground" href={inProgress ? `/projects/${project.id}/workspace` : awaitingBuilder ? `/enterprise/projects/${project.id}/applications` : `/projects/${project.id}`}>
                  {inProgress ? "进入 Workspace →" : awaitingBuilder ? "查看申请与已选 Builder →" : "查看招募视图（登录用户看到的内容）→"}
                </Link>
              </div>
            ) : !locked ? (
              <p className="border-y border-border py-5 font-zh text-sm leading-6 text-muted-foreground" role="alert" data-error-code="SPEC_LOCKED">
                发布前需要先锁定 Spec 范围并补齐参考预算。
              </p>
            ) : !depositSucceeded ? (
              <div>
                <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Public scope</p>
                <h2 className="mt-2 font-zh text-lg font-normal">脱敏预览与发布</h2>
                <p className="mt-4 border-y border-border py-4 font-zh text-sm text-muted-foreground" role="alert" data-error-code="PAYMENT_REQUIRED">
                  发布前需要先完成企业模拟定金。
                </p>
              </div>
            ) : !lockedVersion?.document ? (
              <p className="border-y border-border py-5 font-zh text-sm text-destructive" role="alert" data-error-code="INVALID_SOURCE">
                无法读取锁定的 Spec 版本内容，请联系本地环境维护者。
              </p>
            ) : (
              <div>
                <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Public scope</p>
                <h2 className="mt-2 font-zh text-lg font-normal">脱敏预览与发布</h2>
                <p className="mt-2 mb-6 font-zh text-xs leading-5 text-muted-foreground">
                  只允许编辑文字。保存的 ID、引用、条目顺序和里程碑周期继续由服务端核验。
                </p>
                <PublishForm
                  projectId={project.id}
                  version={project.version}
                  lockedSpecVersionId={lockedVersion.id}
                  lockedTitle={project.title}
                  lockedDocument={lockedVersion.document}
                />
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
