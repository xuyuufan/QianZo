import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SpecDocumentView } from "@/components/spec-document-view";
import { getActorById } from "@/modules/identity/service";
import { getProjectPayment } from "@/modules/payments/service";
import { DEMO_CURRENCY, describeBudget, formatMinorUnits } from "@/modules/projects/money";
import { projectIdSchema } from "@/modules/projects/validation";
import { specDeliveryDays, type SpecDocumentV1 } from "@/modules/specs/document";
import type { StoredSpecVersion } from "@/modules/specs/repository";
import { getProjectSpecs } from "@/modules/specs/service";
import { specVersionIdSchema } from "@/modules/specs/validation";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader, projectHeaderRoles } from "../project-header";
import { BudgetForm } from "./budget-form";
import { EditProjectForm } from "./edit-project-form";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ saved?: string; tab?: string; version?: string }>;
};

type ProjectTab = "overview" | "spec" | "milestones";

const tabItems: { id: ProjectTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "spec", label: "Spec" },
  { id: "milestones", label: "Milestones" },
];

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  const parsedId = projectIdSchema.safeParse((await params).projectId);
  if (!parsedId.success) notFound();
  const history = await getProjectSpecs(userId, parsedId.data);
  if (!history) notFound();

  const search = await searchParams;
  const selectedTab: ProjectTab = search.tab === "spec" || search.tab === "milestones" ? search.tab : "overview";
  let viewedVersion = history.current;
  if (search.version) {
    const parsedVersionId = specVersionIdSchema.safeParse(search.version);
    if (!parsedVersionId.success) notFound();
    viewedVersion = history.versions.find((version) => version.id === parsedVersionId.data) ?? null;
    if (!viewedVersion) notFound();
  }

  const { project } = history;
  const locked = project.lockedSpecVersionId !== null;
  // The stage label must reflect the real deposit, not just the lock: after a
  // successful Mock deposit the project is still a draft until it is published,
  // so keying only off `locked` would keep saying "awaiting deposit".
  const paymentState = await getProjectPayment(userId, project.id);
  const depositSucceeded = paymentState?.payment?.status === "SUCCEEDED";
  const budget = describeBudget(project.budgetMinMinor, project.budgetMaxMinor, project.currency);
  const currency = project.currency ?? DEMO_CURRENCY;
  const statusLabel = project.status === "AWAITING_BUILDER"
    ? "等待 Builder Mock 押金"
    : project.status === "IN_PROGRESS"
      ? "进行中"
    : project.status === "OPEN"
      ? "招募中"
      : locked
        ? "范围已锁定"
        : "草稿";
  const stageLabel = project.status === "AWAITING_BUILDER"
    ? "已选择 Builder，等待 Mock 押金；尚未开工"
    : project.status === "IN_PROGRESS"
      ? "Builder 模拟押金已完成，项目已开工"
    : project.status === "OPEN"
      ? "招募已开放"
    : locked
      ? depositSucceeded
        ? "范围已确认，模拟定金已完成，等待发布"
        : "范围已确认，等待模拟定金"
      : history.current
        ? "Spec 已保存，待确认范围"
        : "需求待整理";
  const primaryHref = project.status === "AWAITING_BUILDER"
    ? `/enterprise/projects/${project.id}/applications`
    : project.status === "IN_PROGRESS"
      ? `/projects/${project.id}/workspace`
    : project.status === "OPEN"
      ? `/projects/${project.id}`
    : locked
      ? `/enterprise/projects/${project.id}/publish`
      : `/enterprise/projects/${project.id}/spec`;
  const primaryLabel = project.status === "AWAITING_BUILDER"
    ? "查看申请与已选 Builder"
    : project.status === "IN_PROGRESS"
      ? "进入 Workspace"
    : project.status === "OPEN"
      ? "查看招募页"
    : locked
      ? "Mock 定金与发布"
      : "需求访谈与 Spec";

  return (
    <div className="qz-paper min-h-[100svh]">
      <ProjectHeader fullBleed availableRoles={projectHeaderRoles(actor.roles)} />
      <main className="qz-rise mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link href="/enterprise/projects" className="mb-7 inline-flex items-center gap-2 font-zh text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />返回我的项目
        </Link>

        <header className="flex flex-col gap-6 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Project workspace · {project.id.slice(0, 8)} · 项目版本 {project.version}</p>
            <h1 className="mt-3 break-words font-zh text-3xl font-normal sm:text-4xl">{project.title}</h1>
            <p className="mt-3 max-w-2xl whitespace-pre-wrap font-zh text-sm leading-6 text-muted-foreground">{project.originalRequirement || "尚未补充原始需求说明。"}</p>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-4 font-zh text-xs sm:gap-6 sm:text-right">
            <div><dt className="text-muted-foreground">状态</dt><dd className="mt-1 text-foreground">{statusLabel}</dd></div>
            <div><dt className="text-muted-foreground">参考预算</dt><dd className="mt-1 text-foreground">{budget ?? "待补充"}</dd></div>
            <div><dt className="text-muted-foreground">Spec</dt><dd className="mt-1 text-foreground">{history.current ? `v${history.current.versionNo}` : "待整理"}</dd></div>
          </dl>
        </header>

        {search.saved === "1" ? <p className="mt-5 border border-requester/30 bg-card px-4 py-3 font-zh text-xs" role="status">草稿已保存。</p> : null}
        {locked ? <p className="mt-5 border border-border bg-card px-4 py-3 font-zh text-xs leading-5 text-muted-foreground" role="status">已锁定 Spec 版本：标题、原始需求、参考预算与当前 Spec 已冻结。</p> : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-5 py-3">
          <p className="font-zh text-sm text-muted-foreground">当前阶段：<span className="ml-1 text-foreground">{stageLabel}</span></p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-zh text-xs text-muted-foreground">{history.current ? `${history.current.document ? specDeliveryDays(history.current.document) : "—"} 个自然日计划` : "尚无里程碑计划"}</span>
            <Button asChild size="sm" className="bg-foreground text-background hover:bg-foreground/90">
              <Link href={primaryHref}>{primaryLabel}<ArrowRight className="ml-1 size-3.5" strokeWidth={1.5} /></Link>
            </Button>
            {project.status === "OPEN" ? (
              <Button asChild variant="outline" size="sm" className="font-zh text-xs">
                <Link href={`/enterprise/projects/${project.id}/applications`}>查看申请</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <MilestoneAxis document={history.current?.document ?? null} inProgress={project.status === "IN_PROGRESS"} />

        <nav className="mt-10 flex items-center gap-6 overflow-x-auto border-b border-border" aria-label="项目详情标签">
          {tabItems.map((item) => {
            const current = selectedTab === item.id;
            const href = item.id === "overview" ? `/enterprise/projects/${project.id}` : `/enterprise/projects/${project.id}?tab=${item.id}`;
            return <Link key={item.id} href={href} aria-current={current ? "page" : undefined} className={`relative flex h-11 shrink-0 items-center font-brand text-xs transition-colors ${current ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-foreground" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</Link>;
          })}
          <button type="button" disabled aria-disabled="true" aria-describedby="acceptance-disabled-reason" title="当前尚未开放交付验收" className="relative flex h-11 shrink-0 cursor-not-allowed items-center font-zh text-xs text-muted-foreground/60">验收</button>
        </nav>
        <p id="acceptance-disabled-reason" className="pt-3 font-zh text-[11px] text-muted-foreground">成果提交与验收暂未开放。</p>

        <div className="pt-8">
          {selectedTab === "overview" ? (
            <OverviewPanel
              project={{ id: project.id, title: project.title, originalRequirement: project.originalRequirement, version: project.version }}
              requesterName={actor.displayName}
              builderLabel={project.status === "IN_PROGRESS" ? "已开工" : project.status === "AWAITING_BUILDER" ? "已选定，等待 Mock 押金" : "尚未承接"}
              stageLabel={stageLabel}
              locked={locked}
              budget={budget}
              currency={currency}
              minAmount={project.budgetMinMinor === null ? "" : formatMinorUnits(project.budgetMinMinor, currency)}
              maxAmount={project.budgetMaxMinor === null ? "" : formatMinorUnits(project.budgetMaxMinor, currency)}
            />
          ) : selectedTab === "spec" ? (
            <SpecTab
              projectId={project.id}
              locked={locked}
              versions={history.versions}
              viewedVersion={viewedVersion}
              currentVersionId={history.current?.id ?? null}
            />
          ) : (
            <MilestonesTab document={history.current?.document ?? null} inProgress={project.status === "IN_PROGRESS"} />
          )}
        </div>
      </main>
    </div>
  );
}

function MilestoneAxis({ document, inProgress }: { document: SpecDocumentV1 | null; inProgress: boolean }) {
  const milestones = document?.milestones ?? [];
  return (
    <section className="mt-6 overflow-hidden rounded-md border border-border bg-card p-5 sm:p-6" aria-label="计划里程碑">
      {milestones.length === 0 ? (
        <p className="py-5 text-center font-zh text-sm text-muted-foreground">保存 Spec 后，里程碑计划会显示在这里。</p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <ol className="grid" style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr))`, minWidth: `max(100%, ${milestones.length * 150}px)` }}>
            {milestones.map((milestone, index) => (
              <li key={milestone.id} className="relative pr-5">
                {index < milestones.length - 1 ? <span className="absolute left-3 right-0 top-3 h-px bg-border" aria-hidden="true" /> : null}
                <span className="relative z-10 grid size-6 place-items-center rounded-full border border-border bg-card font-brand text-[9px] text-muted-foreground">{index + 1}</span>
                <p className="mt-3 font-brand text-[10px] uppercase text-muted-foreground">M{String(index + 1).padStart(2, "0")} · 第 {milestone.dueAfterDays} 天</p>
                <p className="mt-1 max-w-48 font-zh text-sm">{milestone.title}</p>
                <p className="mt-1 font-zh text-xs text-muted-foreground">{inProgress ? "项目已开工" : "计划 · 未开工"}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function OverviewPanel({
  project,
  requesterName,
  builderLabel,
  stageLabel,
  locked,
  budget,
  currency,
  minAmount,
  maxAmount,
}: {
  project: { id: string; title: string; originalRequirement: string; version: number };
  requesterName: string;
  builderLabel: string;
  stageLabel: string;
  locked: boolean;
  budget: string | null;
  currency: string;
  minAmount: string;
  maxAmount: string;
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-px border border-border bg-border md:grid-cols-3">
        <SummaryCell label="需求方" value={requesterName} />
        <SummaryCell label="开发者" value={builderLabel} />
        <SummaryCell label="当前阶段" value={stageLabel} />
      </div>

      <section aria-labelledby="activity-title">
        <p id="activity-title" className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Activity</p>
        <p className="mt-3 font-zh text-sm text-muted-foreground">当前不记录项目动态；状态、里程碑和 Spec 历史可在对应页面查看。</p>
      </section>

      <div className="grid gap-8 border-y border-border py-6 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="project-edit-title">
          <div className="flex items-center justify-between gap-4">
            <h2 id="project-edit-title" className="font-zh text-sm">项目信息</h2>
            {locked ? <span className="font-zh text-xs text-muted-foreground">已随 Spec 锁定</span> : null}
          </div>
          {!locked ? (
            <details className="mt-3 border-t border-border pt-3">
              <summary className="cursor-pointer list-none font-zh text-xs text-muted-foreground marker:hidden hover:text-foreground">编辑项目说明</summary>
              <EditProjectForm project={project} />
            </details>
          ) : <p className="mt-3 font-zh text-xs text-muted-foreground">锁定版本内的标题和原始需求保持不变。</p>}
        </section>

        <section aria-labelledby="budget-title">
          <div className="flex items-center justify-between gap-4">
            <h2 id="budget-title" className="font-zh text-sm">参考预算 <span className="font-brand text-[10px] text-muted-foreground">· {currency}</span></h2>
            <p className="font-zh text-xs text-muted-foreground">{budget ?? "尚未填写"}</p>
          </div>
          {!locked ? (
            <details className="mt-3 border-t border-border pt-3">
              <summary className="cursor-pointer list-none font-zh text-xs text-muted-foreground marker:hidden hover:text-foreground">{budget ? "编辑参考预算" : "补充参考预算"}</summary>
              <BudgetForm projectId={project.id} version={project.version} minAmount={minAmount} maxAmount={maxAmount} />
            </details>
          ) : <p className="mt-3 font-zh text-xs text-muted-foreground">预算已随锁定版本冻结；此处金额是模拟参考值，不是成交价。</p>}
        </section>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return <div className="bg-card p-5 sm:p-6"><p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-3 break-words font-zh text-sm">{value}</p></div>;
}

function SpecTab({
  projectId,
  locked,
  versions,
  viewedVersion,
  currentVersionId,
}: {
  projectId: string;
  locked: boolean;
  versions: StoredSpecVersion[];
  viewedVersion: StoredSpecVersion | null;
  currentVersionId: string | null;
}) {
  return (
    <section aria-labelledby="spec-tab-title">
      <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">SPEC DOCUMENT V1</p><h2 id="spec-tab-title" className="mt-2 font-zh text-xl">项目 Spec</h2></div>
        <Button asChild variant="outline" size="sm" className="w-fit border-border bg-card font-zh text-xs shadow-none">
          <Link href={`/enterprise/projects/${projectId}/spec`}>{locked ? "查看已锁定版本" : "访谈与编辑 Spec"}<ArrowRight className="ml-1 size-3.5" strokeWidth={1.5} /></Link>
        </Button>
      </div>
      {versions.length === 0 ? (
        <div className="py-12 text-center"><p className="font-zh text-sm text-muted-foreground">还没有保存过 Spec 版本。</p><Link href={`/enterprise/projects/${projectId}/spec`} className="mt-3 inline-block font-zh text-xs text-foreground underline underline-offset-4">开始需求访谈</Link></div>
      ) : (
        <>
          <nav className="mb-7 flex flex-wrap gap-4" aria-label="Spec 版本历史">
            {versions.map((version) => {
              const active = viewedVersion?.id === version.id;
              const href = `/enterprise/projects/${projectId}?tab=spec&version=${version.id}`;
              return <Link key={version.id} href={href} aria-current={active ? "page" : undefined} className={`border-b pb-2 font-zh text-xs ${active ? "border-requester text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>版本 {version.versionNo}{version.id === currentVersionId ? " · 当前" : " · 历史"}</Link>;
            })}
          </nav>
          {viewedVersion?.document ? (
            <>
              <p className="mb-6 font-zh text-xs text-muted-foreground">{viewedVersion.sourceMessageId ? "来源：采用访谈候选" : "来源：手工保存"} · {dateFormat.format(viewedVersion.createdAt)}{viewedVersion.id === currentVersionId ? "" : " · 历史版本只读"}</p>
              <SpecDocumentView document={viewedVersion.document} />
            </>
          ) : <p className="border border-border px-4 py-3 font-zh text-xs text-muted-foreground" role="status">该版本内容无法通过 Spec 校验，历史记录仍保留。</p>}
        </>
      )}
    </section>
  );
}

function MilestonesTab({ document, inProgress }: { document: SpecDocumentV1 | null; inProgress: boolean }) {
  if (!document) return <p className="py-12 text-center font-zh text-sm text-muted-foreground">还没有保存过 Spec，因此没有里程碑计划。</p>;
  const deliverables = new Map(document.deliverables.map((item) => [item.id, item.title]));
  return (
    <section aria-labelledby="milestones-tab-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 id="milestones-tab-title" className="font-zh text-xl">里程碑计划</h2>
        <span className="font-zh text-xs text-muted-foreground">按 Spec 中的累计自然日排序</span>
      </div>
      <div className="divide-y divide-border border-y border-border">
      {document.milestones.map((milestone, index) => (
        <article key={milestone.id} className="grid gap-4 py-6 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
          <span className="font-brand text-xs text-muted-foreground">M{String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <h2 className="font-zh text-sm">{milestone.title}<span className="ml-2 font-zh text-xs text-muted-foreground">{inProgress ? "项目已开工 · 状态详情见 Workspace" : "计划 · 未开工"}</span></h2>
            <p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{milestone.description}</p>
            <p className="mt-3 font-zh text-xs text-muted-foreground">交付物：{milestone.deliverableIds.map((id) => deliverables.get(id) ?? id).join("、") || "未指定"}</p>
            <ul className="mt-5 space-y-4 border-t border-border pt-4">
              {milestone.acceptanceCriteria.map((criterion) => (
                <li key={criterion.id} className="grid gap-2 sm:grid-cols-[48px_minmax(0,1fr)]">
                  <span className="font-brand text-[10px] text-muted-foreground">{criterion.id}</span>
                  <div><p className="font-zh text-sm leading-6">{criterion.description}</p><p className="mt-1 font-zh text-xs leading-5 text-muted-foreground">验证方法：{criterion.verificationMethod}</p></div>
                </li>
              ))}
            </ul>
          </div>
          <span className="font-brand text-xs text-muted-foreground">累计第 {milestone.dueAfterDays} 天</span>
        </article>
      ))}
      </div>
    </section>
  );
}
