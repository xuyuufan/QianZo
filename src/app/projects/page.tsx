import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { listOpenRecruitments } from "@/modules/recruitment/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "../enterprise/projects/project-header";
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
    <div className="qz-paper min-h-[100svh]">
      <ProjectHeader label="招募浏览" homeHref="/projects" fullBleed availableRoles={projectHeaderRoles(actor.roles)} />
      <main className="qz-rise mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <section aria-labelledby="recruitments-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Open project index</p>
              <h1 id="recruitments-title" className="mt-3 font-zh text-3xl font-normal sm:text-4xl">项目大厅</h1>
              <p className="mt-3 font-zh text-sm text-muted-foreground">找到一个值得完成的项目</p>
            </div>
            <span className="font-brand text-xs text-muted-foreground">{String(recruitments.length).padStart(2, "0")} MATCHES</span>
          </div>
          <RecruitmentList recruitments={recruitments} />
        </section>
      </main>
    </div>
  );
}
