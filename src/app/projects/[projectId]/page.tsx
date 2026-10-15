import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SpecPreview } from "@/components/spec-preview";
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
    <main className="workspace-shell">
      <ProjectHeader label="招募浏览" homeHref="/projects" />
      <section className="workspace-content">
        <Link className="back-link" href="/projects">← 返回招募列表</Link>
        <div className="project-heading">
          <div>
            <p className="eyebrow">已发布 · {momentFormat.format(recruitment.publishedAt)}</p>
            <h1 className="section-title">{recruitment.title}</h1>
          </div>
          <span className="status-pill">OPEN</span>
        </div>

        <section className="project-form">
          <h2 className="subsection-title">参考预算与周期</h2>
          <p>
            参考预算 <strong>{recruitment.budgetLabel}</strong> · 预计周期{" "}
            <strong>{recruitment.deliveryDays}</strong> 个自然日
          </p>
          <p className="spec-muted">
            预算是企业填写的参考金额，不是成交价或报价；周期来自锁定 Spec 最后一个里程碑的累计自然日。
          </p>
        </section>

        <section className="project-form" data-testid="recruitment-snapshot">
          <h2 className="subsection-title">已确认的范围（脱敏）</h2>
          <SpecPreview document={recruitment.document} />
        </section>

        <p className="spec-muted">
          申请、选择与开工在后续切片提供；本页只提供申请前的评估信息，不含企业私有对话、原始需求与付款明细。
        </p>
      </section>
    </main>
  );
}
