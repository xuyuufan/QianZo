import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SpecDocumentView } from "@/components/spec-document-view";
import { getActorById } from "@/modules/identity/service";
import { projectIdSchema } from "@/modules/projects/validation";
import { getOpenRecruitment } from "@/modules/recruitment/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../../enterprise/projects/project-header";

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

  return (
    <main className="qz-paper min-h-[100svh]">
      <ProjectHeader label="招募浏览" homeHref="/projects" fullBleed />
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
          <SpecDocumentView document={recruitment.document} />
        </section>

        <p className="mt-10 border-t border-border pt-5 font-zh text-xs leading-5 text-muted-foreground">
          申请、选择与开工在后续切片提供；本页只提供申请前的评估信息，不含企业私有对话、原始需求与付款明细。
        </p>
      </section>
    </main>
  );
}
