import Link from "next/link";
import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { listOwnProjects } from "@/modules/projects/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "./project-header";

export const dynamic = "force-dynamic";

type ProjectFilter = "all" | "draft" | "open";

const filters: { value: ProjectFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "open", label: "等待开发者" },
];

const dateParts = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export default async function EnterpriseProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE" || !actor.roles.includes("ENTERPRISE")) redirect("/");

  const projectList = await listOwnProjects(userId);
  const rawFilter = (await searchParams).status;
  const selectedFilter: ProjectFilter = rawFilter === "draft" || rawFilter === "open" ? rawFilter : "all";
  const counts: Record<ProjectFilter, number> = {
    all: projectList.length,
    draft: projectList.filter((project) => project.status === "DRAFT").length,
    open: projectList.filter((project) => project.status === "OPEN").length,
  };
  const visibleProjects = projectList.filter((project) =>
    selectedFilter === "all"
    || (selectedFilter === "draft" && project.status === "DRAFT")
    || (selectedFilter === "open" && project.status === "OPEN"),
  );

  return (
    <div className="qz-paper min-h-[100svh]">
      <ProjectHeader fullBleed />
      <main className="qz-rise mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <section aria-labelledby="projects-title">
          <div className="border-b border-border pb-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Project register</p>
                <h1 id="projects-title" className="mt-2 font-zh text-3xl font-normal">我的项目</h1>
              </div>
              <span className="font-brand text-xs text-muted-foreground" aria-label={`显示 ${visibleProjects.length} 个，共 ${projectList.length} 个项目`}>
                {String(visibleProjects.length).padStart(2, "0")} / {String(projectList.length).padStart(2, "0")}
              </span>
            </div>
            <nav className="mt-6 flex gap-5 overflow-x-auto" aria-label="项目状态筛选">
              {filters.map((filter) => {
                const selected = selectedFilter === filter.value;
                const href = filter.value === "all" ? "/enterprise/projects" : `/enterprise/projects?status=${filter.value}`;
                return (
                  <Link
                    key={filter.value}
                    href={href}
                    aria-current={selected ? "page" : undefined}
                    className={`relative flex h-9 shrink-0 items-center gap-2 font-zh text-xs ${selected ? "text-foreground after:absolute after:inset-x-0 after:-bottom-[17px] after:h-px after:bg-requester" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {filter.label}
                    <span className="font-brand text-[10px] text-muted-foreground">{counts[filter.value]}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="border-b border-border py-14 text-center">
              <p className="font-zh text-sm text-muted-foreground">
                {projectList.length === 0 ? "还没有项目，从一个想法开始。" : `暂无${filters.find((item) => item.value === selectedFilter)?.label}项目。`}
              </p>
              {projectList.length === 0 ? (
                <Link href="/enterprise/projects/new" className="mt-3 inline-block font-zh text-xs text-foreground underline underline-offset-4">
                  创建第一份草稿
                </Link>
              ) : selectedFilter !== "all" ? (
                <Link href="/enterprise/projects" className="mt-3 inline-block font-zh text-xs text-foreground underline underline-offset-4">
                  查看全部
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-border border-b border-border">
              {visibleProjects.map((project) => {
                const isOpen = project.status === "OPEN";
                const specHint = isOpen
                  ? "Spec 已确认"
                  : project.currentSpecVersionId
                    ? "Spec 已有版本"
                    : "Spec 待整理";
                return (
                  <li key={project.id}>
                    <Link
                      href={`/enterprise/projects/${project.id}`}
                      className="group grid items-center gap-4 py-5 transition-colors hover:bg-card sm:grid-cols-[minmax(0,1fr)_150px_140px_90px_20px] sm:px-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-zh text-sm font-normal text-foreground">{project.title || "未命名项目"}</span>
                        <span className="mt-1 block truncate font-zh text-xs text-muted-foreground">{project.originalRequirement}</span>
                      </span>
                      <span className="flex items-center gap-2 font-zh text-xs text-muted-foreground">
                        <span className={`size-1.5 rounded-full ${isOpen ? "bg-requester" : "bg-border"}`} />
                        {isOpen ? "等待开发者" : "草稿"}
                      </span>
                      <span className="hidden font-zh text-xs text-muted-foreground sm:block">{specHint}</span>
                      <span className="hidden text-right font-zh text-xs text-muted-foreground sm:block">{formatUpdatedAt(project.updatedAt)}</span>
                      <span className="hidden text-right text-sm text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground sm:block" aria-hidden="true">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function formatUpdatedAt(value: Date): string {
  const parts = Object.fromEntries(dateParts.formatToParts(value).map(({ type, value: part }) => [type, part]));
  const today = Object.fromEntries(dateParts.formatToParts(new Date()).map(({ type, value: part }) => [type, part]));
  const valueDay = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const todayDay = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day));
  const days = Math.round((todayDay - valueDay) / 86_400_000);
  const time = `${parts.hour}:${parts.minute}`;
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  if (days > 1 && days < 7) return `${days} 天前`;
  return `${parts.month}/${parts.day}`;
}
