import Link from "next/link";
import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { listOpenRecruitments } from "@/modules/recruitment/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../enterprise/projects/project-header";

export const dynamic = "force-dynamic";

const momentFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function RecruitmentListPage() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");

  const recruitments = await listOpenRecruitments(userId);

  return (
    <main className="workspace-shell">
      <ProjectHeader label="招募浏览" homeHref="/projects" />
      <section className="workspace-content">
        <div>
          <p className="eyebrow">你好，{actor.displayName}</p>
          <h1 className="section-title">招募中的项目</h1>
        </div>
        <p className="lede">
          这里只展示企业确认过的脱敏范围与参考预算；申请与开工在后续切片提供。
        </p>
        {recruitments.length === 0 ? (
          <div className="empty-state">
            <h2>还没有已发布的项目</h2>
            <p className="lede">企业锁定范围并完成模拟定金后，项目才会出现在这里。</p>
          </div>
        ) : (
          <ul className="project-list">
            {recruitments.map((recruitment) => (
              <li key={recruitment.projectId}>
                <Link href={`/projects/${recruitment.projectId}`}>
                  <span>
                    <strong>{recruitment.title}</strong>
                    <small>{recruitment.goal}</small>
                    <small>
                      参考预算 {recruitment.budgetLabel} · 预计 {recruitment.deliveryDays} 个自然日 ·{" "}
                      {recruitment.milestoneCount} 个里程碑 · 发布于{" "}
                      {momentFormat.format(recruitment.publishedAt)}
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
