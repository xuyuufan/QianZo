import { randomUUID } from "node:crypto";

import Link from "next/link";
import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../project-header";
import { CreateProjectForm } from "./create-project-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  return (
    <main className="workspace-shell">
      <ProjectHeader />
      <section className="workspace-content">
        <Link className="back-link" href="/enterprise/projects">← 返回项目列表</Link>
        <div>
          <p className="eyebrow">NEW PROJECT · 01</p>
          <h1 className="section-title">让想法有一个起点</h1>
          <p className="lede">先记录标题和原始需求。创建后可以随时回来继续完善。</p>
        </div>
        <CreateProjectForm projectId={randomUUID()} />
      </section>
    </main>
  );
}
