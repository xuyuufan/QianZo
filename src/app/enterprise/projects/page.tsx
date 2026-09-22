import Link from "next/link";
import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { listOwnProjects } from "@/modules/projects/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "./project-header";

export const dynamic = "force-dynamic";

export default async function EnterpriseProjectsPage() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE" || !actor.roles.includes("ENTERPRISE")) redirect("/");
  const projectList = await listOwnProjects(userId);

  return (
    <main className="workspace-shell">
      <ProjectHeader />
      <section className="workspace-content">
        <div className="project-list-heading">
          <div>
            <p className="eyebrow">你好，{actor.displayName}</p>
            <h1 className="section-title">项目草稿</h1>
          </div>
          <Link className="button button-link" href="/enterprise/projects/new">创建项目</Link>
        </div>
        {projectList.length === 0 ? (
          <div className="empty-state">
            <h2>还没有项目</h2>
            <p className="lede">创建第一份草稿，内容会保存到本地真实数据库。</p>
          </div>
        ) : (
          <ul className="project-list">
            {projectList.map((project) => (
              <li key={project.id}>
                <Link href={`/enterprise/projects/${project.id}`}>
                  <span>
                    <strong>{project.title}</strong>
                    <small>版本 {project.version} · {project.status}</small>
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
