import type { ReactNode } from "react";

import type { SpecDocumentV1 } from "@/modules/specs/document";

const headings = [
  "项目目标",
  "使用者角色",
  "功能范围",
  "页面结构",
  "用户流程",
  "集成需求",
  "技术约束",
  "交付物",
  "里程碑与验收",
  "范围外事项",
  "假设",
] as const;

export function SpecDocumentView({ document }: { document: SpecDocumentV1 }) {
  const roleNames = new Map(document.userRoles.map((role) => [role.id, role.name]));
  const featureTitles = new Map(document.features.map((feature) => [feature.id, feature.title]));
  const deliverableTitles = new Map(document.deliverables.map((deliverable) => [deliverable.id, deliverable.title]));

  return (
    <div className="grid min-w-0 gap-10 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="min-w-0 max-w-full lg:sticky lg:top-20 lg:self-start">
        <p className="mb-4 font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Spec index</p>
        <nav aria-label="Spec 文档目录" className="flex max-w-[calc(100vw-2.5rem)] gap-1 overflow-x-auto border-b border-border pb-3 lg:block lg:max-w-none lg:border-b-0 lg:border-l lg:pb-0">
          {headings.map((heading, index) => (
            <a key={heading} href={`#spec-section-${index + 1}`} className="flex shrink-0 items-center gap-2 px-3 py-2 font-zh text-xs text-muted-foreground transition-colors hover:text-foreground lg:border-l lg:border-transparent lg:-ml-px">
              <span className="font-brand">{String(index + 1).padStart(2, "0")}</span>{heading}
            </a>
          ))}
        </nav>
      </aside>

      <article className="min-w-0">
        <SpecSection index={1} title={headings[0]}>
          <p className="max-w-2xl whitespace-pre-wrap font-zh text-sm leading-7 text-foreground">{document.projectGoal || "未指定项目目标。"}</p>
          <p className="mt-4 font-brand text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Background</p>
          <p className="mt-2 max-w-2xl whitespace-pre-wrap font-zh text-sm leading-7 text-muted-foreground">{document.background || "未填写背景说明。"}</p>
        </SpecSection>

        <SpecSection index={2} title={headings[1]}>
          <div className="divide-y divide-border border-y border-border">
            {document.userRoles.length === 0 ? <p className="py-4 font-zh text-sm text-muted-foreground">未指定</p> : document.userRoles.map((role) => (
              <div key={role.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
                <div><span className="font-brand text-[10px] text-muted-foreground">{role.id}</span><h3 className="mt-1 font-zh text-sm">{role.name}</h3></div>
                <p className="font-zh text-sm leading-6 text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>
        </SpecSection>

        <SpecSection index={3} title={headings[2]}>
          <div className="space-y-3">
            {document.features.map((feature) => (
              <div key={feature.id} className="border border-border bg-card">
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[72px_minmax(0,1fr)]">
                  <span className="font-brand text-xs text-muted-foreground">{feature.id}</span>
                  <div><h3 className="font-zh text-sm font-medium">{feature.title}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{feature.description}</p>
                    <p className="mt-3 font-zh text-xs text-muted-foreground">使用角色：{feature.userRoleIds.map((id) => roleNames.get(id) ?? id).join("、") || "未指定"}</p>
                  </div>
                </div>
              </div>
            ))}
            {document.features.length === 0 ? <Empty /> : null}
          </div>
        </SpecSection>

        <SpecSection index={4} title={headings[3]}>
          <div className="divide-y divide-border border-y border-border">
            {document.pages.map((page) => (
              <div key={page.id} className="py-4"><p className="font-brand text-[10px] text-muted-foreground">{page.id}</p><h3 className="mt-1 font-zh text-sm">{page.name}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{page.purpose}</p><p className="mt-2 font-zh text-xs text-muted-foreground">关联功能：{page.featureIds.map((id) => featureTitles.get(id) ?? id).join("、") || "未指定"}</p></div>
            ))}
          </div>
          {document.pages.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={5} title={headings[4]}>
          <div className="space-y-5">
            {document.userFlows.map((flow) => (
              <section key={flow.id} className="border-l border-border pl-4">
                <p className="font-brand text-[10px] text-muted-foreground">{flow.id}</p><h3 className="mt-1 font-zh text-sm">{flow.name}</h3>
                <ol className="mt-3 space-y-2">
                  {flow.steps.map((step, index) => <li key={`${flow.id}-${index}`} className="flex gap-3 font-zh text-sm leading-6"><span className="font-brand text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}
                </ol>
              </section>
            ))}
          </div>
          {document.userFlows.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={6} title={headings[5]}>
          <div className="divide-y divide-border border-y border-border">
            {document.integrations.map((integration) => (
              <div key={integration.id} className="grid gap-2 py-4 sm:grid-cols-[72px_minmax(0,1fr)]"><span className="font-brand text-xs text-muted-foreground">{integration.id}</span><div><h3 className="font-zh text-sm">{integration.name}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{integration.purpose}</p><p className="mt-2 font-zh text-xs text-muted-foreground">约束：{integration.constraints}</p></div></div>
            ))}
          </div>
          {document.integrations.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={7} title={headings[6]}>
          <TextList items={document.technicalConstraints} />
        </SpecSection>

        <SpecSection index={8} title={headings[7]}>
          <div className="divide-y divide-border border-y border-border">
            {document.deliverables.map((item) => <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[72px_minmax(0,1fr)]"><span className="font-brand text-xs text-muted-foreground">{item.id}</span><div><h3 className="font-zh text-sm">{item.title}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{item.description}</p></div></div>)}
          </div>
          {document.deliverables.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={9} title={headings[8]}>
          <div className="space-y-5">
            {document.milestones.map((milestone, index) => (
              <section key={milestone.id} className="border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div><p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">M{String(index + 1).padStart(2, "0")} · {milestone.id}</p><h3 className="mt-2 font-zh text-sm">{milestone.title}</h3></div>
                  <span className="font-zh text-xs text-muted-foreground">累计第 {milestone.dueAfterDays} 个自然日</span>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <p className="font-zh text-sm leading-6 text-muted-foreground">{milestone.description}</p>
                  <p className="font-zh text-xs text-muted-foreground">交付物：{milestone.deliverableIds.map((id) => deliverableTitles.get(id) ?? id).join("、") || "未指定"}</p>
                  <div className="border-t border-border pt-4">
                    <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Acceptance criteria</p>
                    <ul className="mt-3 space-y-4">
                      {milestone.acceptanceCriteria.map((criterion) => <li key={criterion.id} data-testid="public-acceptance-criterion" className="grid gap-2 sm:grid-cols-[48px_minmax(0,1fr)]"><span className="font-brand text-[10px] text-muted-foreground">{criterion.id}</span><div><p className="font-zh text-sm leading-6">{criterion.description}</p><p className="mt-2 font-zh text-xs leading-5 text-muted-foreground">验证方式：{criterion.verificationMethod}</p></div></li>)}
                      {milestone.acceptanceCriteria.length === 0 ? <li className="font-zh text-sm text-muted-foreground">未指定</li> : null}
                    </ul>
                  </div>
                </div>
              </section>
            ))}
            {document.milestones.length === 0 ? <Empty /> : null}
          </div>
        </SpecSection>

        <SpecSection index={10} title={headings[9]}>
          <TextList items={document.outOfScope} />
        </SpecSection>

        <SpecSection index={11} title={headings[10]}>
          <TextList items={document.assumptions} />
        </SpecSection>
      </article>
    </div>
  );
}

function SpecSection({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <section id={`spec-section-${index}`} data-testid="spec-document-section" className="scroll-mt-20 border-t border-border py-8 first:border-t-0 first:pt-0">
      <div className="grid gap-3 sm:grid-cols-[48px_minmax(0,1fr)]">
        <span className="font-brand text-xs text-muted-foreground">{String(index).padStart(2, "0")}</span>
        <div className="min-w-0"><h2 className="mb-5 font-zh text-xl font-normal">{title}</h2>{children}</div>
      </div>
    </section>
  );
}

function TextList({ items }: { items: string[] }) {
  if (items.length === 0) return <Empty />;
  return <ul className="divide-y divide-border border-y border-border">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-3 py-3 font-zh text-sm leading-6"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"/><span>{item}</span></li>)}</ul>;
}

function Empty() {
  return <p className="border-y border-border py-4 font-zh text-sm text-muted-foreground">未指定</p>;
}
