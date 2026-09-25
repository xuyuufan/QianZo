import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { listOpenRecruitments } from "@/modules/recruitment/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../enterprise/projects/project-header";
import { RecruitmentList } from "./recruitment-list";

export const dynamic = "force-dynamic";

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
        <RecruitmentList recruitments={recruitments} />
      </section>
    </main>
  );
}
