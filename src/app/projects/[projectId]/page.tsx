import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SpecDocumentView } from "@/components/spec-document-view";
import { getActorById } from "@/modules/identity/service";
import { getOwnApplicationForProject } from "@/modules/applications/service";
import { projectIdSchema } from "@/modules/projects/validation";
import { getOpenRecruitment } from "@/modules/recruitment/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "../../enterprise/projects/project-header";
import { ApplicationForm } from "./application-form";

export const dynamic = "force-dynamic";

type RecruitmentPageProps = {
  params: Promise<{ projectId: string }>;
};

const momentFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function RecruitmentDetailPage({ params }: RecruitmentPageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");

  const parsedId = projectIdSchema.safeParse((await params).projectId);
  if (!parsedId.success) notFound();
  // A draft, a locked-but-unpublished or a missing project all read as absent.
  const recruitment = await getOpenRecruitment(userId, parsedId.data);
  if (!recruitment) notFound();
  const ownApplication = recruitment.canApply
    ? await getOwnApplicationForProject(userId, parsedId.data)
    : null;

  return (
    <main className="qz-paper min-h-[100svh]">
      <ProjectHeader label="招募浏览" homeHref="/projects" fullBleed availableRoles={projectHeaderRoles(actor.roles)} />
      <section className="qz-rise mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link className="mb-8 inline-flex items-center gap-2 font-zh text-xs text-muted-foreground transition-colors hover:text-foreground" href="/projects">
          ← 返回招募列表
        </Link>
        <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Confirmed spec · {recruitment.projectId}
            </p>
            <h1 className="mt-3 break-words font-zh text-3xl font-normal sm:text-4xl">{recruitment.title}</h1>
            <p className="mt-3 max-w-2xl font-zh text-sm leading-6 text-muted-foreground">
              已由需求方确认并发布的项目范围，可用于申请前评估。
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-zh text-xs text-muted-foreground">
              <span data-testid="recruitment-budget">参考预算 <strong className="font-normal text-foreground">{recruitment.budgetLabel}</strong></span>
              <span data-testid="recruitment-cycle">预计周期 <strong className="font-normal text-foreground">{recruitment.deliveryDays} 个自然日</strong></span>
              <span>发布于 {momentFormat.format(recruitment.publishedAt)}</span>
            </div>
          </div>
          <span className="w-fit border border-border px-2.5 py-1 font-brand text-[10px] tracking-[0.12em] text-muted-foreground">OPEN</span>
        </header>

        <section className="mt-8 border-b border-border pb-7" aria-label="预算说明">
          <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Reference only</p>
          <p className="mt-2 max-w-3xl font-zh text-xs leading-5 text-muted-foreground">
            预算是企业填写的参考金额，不是成交价或报价；周期来自锁定 Spec 最后一个里程碑的累计自然日。
          </p>
        </section>

        <section className="mt-9" data-testid="recruitment-snapshot">
          <div className="mb-7 border-b border-border pb-5">
            <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Public project scope</p>
            <h2 className="mt-2 font-zh text-xl font-normal">已确认的范围</h2>
          </div>
          <SpecDocumentView document={recruitment.document} showIds={false} />
        </section>

        {actor.roles.includes("BUILDER") ? (
          <section className="mt-10 border-t border-border pt-7" aria-labelledby="apply-title">
            <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Builder application</p>
            <h2 id="apply-title" className="mt-2 font-zh text-xl font-normal">申请这个项目</h2>
            <p className="mt-2 font-zh text-xs leading-5 text-muted-foreground">介绍与你相关的经验，并说明你会如何推进项目。</p>
            {actor.roles.includes("BUILDER") && !recruitment.canApply ? (
              <p className="mt-5 font-zh text-sm text-muted-foreground" role="status">项目负责人不能申请自己负责的项目。</p>
            ) : ownApplication ? (
              <p className="mt-5 font-zh text-sm" role="status">
                你已提交申请（{ownApplication.status === "SELECTED" ? "已被选择" : "等待企业选择"}）。
                <Link href="/builder/applications" className="ml-2 underline underline-offset-4">查看我的申请</Link>
              </p>
            ) : recruitment.canApply ? <ApplicationForm projectId={recruitment.projectId} /> : null}
          </section>
        ) : (
          <p className="mt-10 border-t border-border pt-5 font-zh text-xs leading-5 text-muted-foreground">
            申请由 Builder 身份提交；本页只提供脱敏评估信息，不含企业私有对话、原始需求与付款明细。
          </p>
        )}
      </section>
    </main>
  );
}
