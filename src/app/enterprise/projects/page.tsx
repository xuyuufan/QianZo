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
            <p className="eyebrow">ENTERPRISE WORKSPACE · {actor.displayName}</p>
            <h1 className="section-title">我的项目</h1>
            <p className="lede">在这里管理需求草稿、评审范围与已发布招募。</p>
          </div>
          <Link className="button button-link create-project-cta" href="/enterprise/projects/new">＋ <span>创建项目</span></Link>
        </div>
        {projectList.length === 0 ? (
          <div className="empty-state workspace-empty">
            <span className="empty-symbol" aria-hidden="true">＋</span>
            <p className="eyebrow">YOUR NEXT IDEA STARTS HERE</p>
            <h2>从一个想法开始</h2>
            <p className="lede">先保存标题和原始需求，再逐步整理为清晰可评审的 Spec。</p>
            <Link className="button button-link" href="/enterprise/projects/new">创建第一份草稿</Link>
          </div>
        ) : (
          <ul className="project-list project-card-list">
            {projectList.map((project) => (
              <li key={project.id}>
                <Link href={`/enterprise/projects/${project.id}`}>
                  <span>
                    <small className="project-card-kicker">PROJECT · {String(project.version).padStart(2, "0")}</small>
                    <strong>{project.title || "未命名项目"}</strong>
                    <small>项目版本 {project.version}</small>
                  </span>
                  <span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status === "OPEN" ? "招募中" : "草稿"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
