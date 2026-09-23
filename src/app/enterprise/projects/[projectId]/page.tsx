import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { getOwnProject } from "@/modules/projects/service";
import { projectIdSchema } from "@/modules/projects/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../project-header";
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

  return (
    <main className="workspace-shell">
      <ProjectHeader />
      <section className="workspace-content">
        <Link className="back-link" href="/enterprise/projects">← 返回项目列表</Link>
        <div className="project-heading">
          <div>
            <p className="eyebrow">草稿 · 版本 {project.version}</p>
            <h1 className="section-title">{project.title}</h1>
          </div>
          <span className="status-pill">DRAFT</span>
        </div>
        {saved ? <p className="form-message success" role="status">草稿已保存。</p> : null}
        <EditProjectForm project={project} />
        <nav className="step-links">
          <Link className="button button-link" href={`/enterprise/projects/${project.id}/spec`}>
            需求访谈与 Spec
          </Link>
          <span className="spec-muted">先通过 Mock 访谈整理需求，再保存并锁定 Spec。</span>
        </nav>
      </section>
    </main>
  );
}
