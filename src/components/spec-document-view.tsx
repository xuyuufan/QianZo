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

type SpecDocumentViewProps = {
  document: SpecDocumentV1;
  /**
   * Prefixed to every element id and in-page anchor so several instances can be
   * mounted at once (current / candidate / history) without clashing ids.
   */
  idPrefix?: string;
  /**
   * Whether the internal structural ids (role / feature / page / milestone …)
   * are shown. Turn off on the public recruitment view so the masked scope does
   * not leak the authoring structure; ordinal placeholders keep the layout.
   */
  showIds?: boolean;
};

export function SpecDocumentView({ document, idPrefix = "", showIds = true }: SpecDocumentViewProps) {
  const roleNames = new Map(document.userRoles.map((role) => [role.id, role.name]));
  const featureTitles = new Map(document.features.map((feature) => [feature.id, feature.title]));
  const deliverableTitles = new Map(document.deliverables.map((deliverable) => [deliverable.id, deliverable.title]));

  return (
    <div className="grid min-w-0 gap-10 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="min-w-0 max-w-full lg:sticky lg:top-20 lg:self-start">
        <p className="mb-4 font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Spec index</p>
        <nav aria-label="Spec 文档目录" className="flex max-w-[calc(100vw-2.5rem)] gap-1 overflow-x-auto border-b border-border pb-3 lg:block lg:max-w-none lg:border-b-0 lg:border-l lg:pb-0">
          {headings.map((heading, index) => (
            <a key={heading} href={`#${idPrefix}spec-section-${index + 1}`} className="flex shrink-0 items-center gap-2 px-3 py-2 font-zh text-xs text-muted-foreground transition-colors hover:text-foreground lg:border-l lg:border-transparent lg:-ml-px">
              <span className="font-brand">{String(index + 1).padStart(2, "0")}</span>{heading}
            </a>
          ))}
        </nav>
      </aside>

      <article className="min-w-0">
        <SpecSection index={1} title={headings[0]} idPrefix={idPrefix}>
          <p className="max-w-2xl whitespace-pre-wrap font-zh text-sm leading-7 text-foreground">{document.projectGoal || "未指定项目目标。"}</p>
          <p className="mt-4 font-brand text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Background</p>
          <p className="mt-2 max-w-2xl whitespace-pre-wrap font-zh text-sm leading-7 text-muted-foreground">{document.background || "未填写背景说明。"}</p>
        </SpecSection>

        <SpecSection index={2} title={headings[1]} idPrefix={idPrefix}>
          <div className="divide-y divide-border border-y border-border">
            {document.userRoles.length === 0 ? <p className="py-4 font-zh text-sm text-muted-foreground">未指定</p> : document.userRoles.map((role, index) => (
              <div key={showIds ? role.id : index} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
                <div>{showIds ? <span className="font-brand text-[10px] text-muted-foreground">{role.id}</span> : null}<h3 className="mt-1 font-zh text-sm">{role.name}</h3></div>
                <p className="font-zh text-sm leading-6 text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>
        </SpecSection>

        <SpecSection index={3} title={headings[2]} idPrefix={idPrefix}>
          <div className="space-y-3">
            {document.features.map((feature, index) => (
              <div key={showIds ? feature.id : index} className="border border-border bg-card">
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[72px_minmax(0,1fr)]">
                  <span className="font-brand text-xs text-muted-foreground">{showIds ? feature.id : ordinal(index)}</span>
                  <div><h3 className="font-zh text-sm font-medium">{feature.title}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{feature.description}</p>
                    <p className="mt-3 font-zh text-xs text-muted-foreground">使用角色：{feature.userRoleIds.map((id) => roleNames.get(id) ?? (showIds ? id : "未指定")).join("、") || "未指定"}</p>
                  </div>
                </div>
              </div>
            ))}
            {document.features.length === 0 ? <Empty /> : null}
          </div>
        </SpecSection>

        <SpecSection index={4} title={headings[3]} idPrefix={idPrefix}>
          <div className="divide-y divide-border border-y border-border">
            {document.pages.map((page, index) => (
              <div key={showIds ? page.id : index} className="py-4">{showIds ? <p className="font-brand text-[10px] text-muted-foreground">{page.id}</p> : null}<h3 className="mt-1 font-zh text-sm">{page.name}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{page.purpose}</p><p className="mt-2 font-zh text-xs text-muted-foreground">关联功能：{page.featureIds.map((id) => featureTitles.get(id) ?? (showIds ? id : "未指定")).join("、") || "未指定"}</p></div>
            ))}
          </div>
          {document.pages.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={5} title={headings[4]} idPrefix={idPrefix}>
          <div className="space-y-5">
            {document.userFlows.map((flow, flowIndex) => (
              <section key={showIds ? flow.id : flowIndex} className="border-l border-border pl-4">
                {showIds ? <p className="font-brand text-[10px] text-muted-foreground">{flow.id}</p> : null}<h3 className="mt-1 font-zh text-sm">{flow.name}</h3>
                <ol className="mt-3 space-y-2">
                  {flow.steps.map((step, index) => <li key={showIds ? `${flow.id}-${index}` : index} className="flex gap-3 font-zh text-sm leading-6"><span className="font-brand text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}
                </ol>
              </section>
            ))}
          </div>
          {document.userFlows.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={6} title={headings[5]} idPrefix={idPrefix}>
          <div className="divide-y divide-border border-y border-border">
            {document.integrations.map((integration, index) => (
              <div key={showIds ? integration.id : index} className="grid gap-2 py-4 sm:grid-cols-[72px_minmax(0,1fr)]"><span className="font-brand text-xs text-muted-foreground">{showIds ? integration.id : ordinal(index)}</span><div><h3 className="font-zh text-sm">{integration.name}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{integration.purpose}</p><p className="mt-2 font-zh text-xs text-muted-foreground">约束：{integration.constraints}</p></div></div>
            ))}
          </div>
          {document.integrations.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={7} title={headings[6]} idPrefix={idPrefix}>
          <TextList items={document.technicalConstraints} />
        </SpecSection>

        <SpecSection index={8} title={headings[7]} idPrefix={idPrefix}>
          <div className="divide-y divide-border border-y border-border">
            {document.deliverables.map((item, index) => <div key={showIds ? item.id : index} className="grid gap-2 py-4 sm:grid-cols-[72px_minmax(0,1fr)]"><span className="font-brand text-xs text-muted-foreground">{showIds ? item.id : ordinal(index)}</span><div><h3 className="font-zh text-sm">{item.title}</h3><p className="mt-2 font-zh text-sm leading-6 text-muted-foreground">{item.description}</p></div></div>)}
          </div>
          {document.deliverables.length === 0 ? <Empty /> : null}
        </SpecSection>

        <SpecSection index={9} title={headings[8]} idPrefix={idPrefix}>
          <div className="space-y-5">
            {document.milestones.map((milestone, index) => (
              <section key={showIds ? milestone.id : index} className="border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div><p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">M{String(index + 1).padStart(2, "0")}{showIds ? ` · ${milestone.id}` : ""}</p><h3 className="mt-2 font-zh text-sm">{milestone.title}</h3></div>
                  <span className="font-zh text-xs text-muted-foreground">累计第 {milestone.dueAfterDays} 个自然日</span>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <p className="font-zh text-sm leading-6 text-muted-foreground">{milestone.description}</p>
                  <p className="font-zh text-xs text-muted-foreground">交付物：{milestone.deliverableIds.map((id) => deliverableTitles.get(id) ?? (showIds ? id : "未指定")).join("、") || "未指定"}</p>
                  <div className="border-t border-border pt-4">
                    <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Acceptance criteria</p>
                    <ul className="mt-3 space-y-4">
                      {milestone.acceptanceCriteria.map((criterion, criterionIndex) => <li key={showIds ? criterion.id : criterionIndex} data-testid="public-acceptance-criterion" className="grid gap-2 sm:grid-cols-[48px_minmax(0,1fr)]"><span className="font-brand text-[10px] text-muted-foreground">{showIds ? criterion.id : ordinal(criterionIndex)}</span><div><p className="font-zh text-sm leading-6">{criterion.description}</p><p className="mt-2 font-zh text-xs leading-5 text-muted-foreground">验证方式：{criterion.verificationMethod}</p></div></li>)}
                      {milestone.acceptanceCriteria.length === 0 ? <li className="font-zh text-sm text-muted-foreground">未指定</li> : null}
                    </ul>
                  </div>
                </div>
              </section>
            ))}
            {document.milestones.length === 0 ? <Empty /> : null}
          </div>
        </SpecSection>

        <SpecSection index={10} title={headings[9]} idPrefix={idPrefix}>
          <TextList items={document.outOfScope} />
        </SpecSection>

        <SpecSection index={11} title={headings[10]} idPrefix={idPrefix}>
          <TextList items={document.assumptions} />
        </SpecSection>
      </article>
    </div>
  );
}

/** Two-digit positional label used in place of a hidden structural id. */
function ordinal(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function SpecSection({ index, title, idPrefix, children }: { index: number; title: string; idPrefix: string; children: ReactNode }) {
  return (
    <section id={`${idPrefix}spec-section-${index}`} data-testid="spec-document-section" className="scroll-mt-20 border-t border-border py-8 first:border-t-0 first:pt-0">
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
