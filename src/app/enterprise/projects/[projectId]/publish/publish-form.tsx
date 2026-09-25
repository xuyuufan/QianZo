"use client";

import { useActionState, useMemo, useState } from "react";

import { emptyProjectActionState } from "@/app/actions/project-state";
import { publishProjectAction } from "@/app/actions/publish";
import { SpecField as Field, SpecFieldIssueProvider } from "@/components/spec-field";
import { SpecPreview } from "@/components/spec-preview";
import {
  specDocumentSchema,
  type SpecDocumentV1,
  type SpecMilestone,
} from "@/modules/specs/document";
import { maskSpecIssues } from "@/modules/specs/mask";
import { describeFieldIssues } from "@/platform/validation";

type PublishFormProps = {
  projectId: string;
  version: number;
  lockedSpecVersionId: string;
  lockedTitle: string;
  lockedDocument: SpecDocumentV1;
};

type TextCollection = "technicalConstraints" | "outOfScope" | "assumptions";

export function PublishForm({
  projectId,
  version,
  lockedSpecVersionId,
  lockedTitle,
  lockedDocument,
}: PublishFormProps) {
  const action = publishProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptyProjectActionState);
  const [title, setTitle] = useState(lockedTitle);
  const [document, setDocument] = useState(lockedDocument);
  const [confirmed, setConfirmed] = useState(false);
  const content = useMemo(() => JSON.stringify(document), [document]);

  const validation = useMemo(() => {
    const parsed = specDocumentSchema.safeParse(document);
    if (!parsed.success) {
      return {
        issues: describeFieldIssues(parsed.error),
        paths: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      };
    }
    return {
      issues: maskSpecIssues(lockedDocument, parsed.data),
      paths: [],
    };
  }, [document, lockedDocument]);

  const issues = validation.issues.length > 0 ? validation.issues : state.issues;
  const blocked = issues.length > 0 || !confirmed;

  function updateDocument(update: (current: SpecDocumentV1) => SpecDocumentV1) {
    setDocument((current) => update(current));
    setConfirmed(false);
  }

  function updateMilestone(index: number, update: Partial<SpecMilestone>) {
    updateDocument((current) => ({
      ...current,
      milestones: current.milestones.map((milestone, at) =>
        at === index ? { ...milestone, ...update } : milestone,
      ),
    }));
  }

  function updateTextCollection(collection: TextCollection, index: number, value: string) {
    updateDocument((current) => ({
      ...current,
      [collection]: current[collection].map((item, at) => at === index ? value : item),
    }));
  }

  return (
    <form
      action={formAction}
      className="project-form structured-mask-form"
      data-testid="structured-masked-spec-editor"
    >
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="lockedSpecVersionId" type="hidden" value={lockedSpecVersionId} />
      <input name="maskedDocument" type="hidden" value={content} />

      <label className="field">
        <span>招募标题（脱敏后）</span>
        <input
          name="maskedTitle"
          type="text"
          value={title}
          maxLength={120}
          required
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setConfirmed(false);
          }}
        />
      </label>

      <div className="mask-editor-notice">
        <strong>仅编辑文字</strong>
        <p>
          ID、引用、条目数量和顺序、里程碑周期及验收标准数量沿用锁定版本。修改标题或任何文字后，需要重新确认最终预览。
        </p>
      </div>

      <SpecFieldIssueProvider value={validation.paths}>
        <div className="spec-mask-sections">
          <fieldset className="spec-editor-section" id="mask-goal">
            <legend><span>01</span> 目标与背景</legend>
            <Field label="项目目标" path="projectGoal" value={document.projectGoal} onChange={(value) => updateDocument((current) => ({ ...current, projectGoal: value }))} multiline />
            <Field label="项目背景" path="background" value={document.background} onChange={(value) => updateDocument((current) => ({ ...current, background: value }))} multiline optional />
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-roles">
            <legend><span>02</span> 使用者角色</legend>
            {document.userRoles.map((role, index) => (
              <article className="spec-edit-card" key={role.id}>
                <ItemIdentity id={role.id} />
                <Field label="角色名称" path={"userRoles." + index + ".name"} value={role.name} onChange={(value) => updateDocument((current) => ({ ...current, userRoles: current.userRoles.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
                <Field label="职责说明" path={"userRoles." + index + ".description"} value={role.description} onChange={(value) => updateDocument((current) => ({ ...current, userRoles: current.userRoles.map((item, at) => at === index ? { ...item, description: value } : item) }))} multiline />
              </article>
            ))}
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-features">
            <legend><span>03</span> 功能范围</legend>
            {document.features.map((feature, index) => (
              <article className="spec-edit-card" key={feature.id}>
                <ItemIdentity id={feature.id} />
                <Field label="功能名称" path={"features." + index + ".title"} value={feature.title} onChange={(value) => updateDocument((current) => ({ ...current, features: current.features.map((item, at) => at === index ? { ...item, title: value } : item) }))} />
                <Field label="功能说明" path={"features." + index + ".description"} value={feature.description} onChange={(value) => updateDocument((current) => ({ ...current, features: current.features.map((item, at) => at === index ? { ...item, description: value } : item) }))} multiline />
                <ReferenceDisplay label="适用角色" selected={feature.userRoleIds} options={document.userRoles.map(({ id, name }) => ({ id, label: name }))} />
              </article>
            ))}
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-pages">
            <legend><span>04</span> 页面与界面</legend>
            {document.pages.map((page, index) => (
              <article className="spec-edit-card" key={page.id}>
                <ItemIdentity id={page.id} />
                <Field label="页面名称" path={"pages." + index + ".name"} value={page.name} onChange={(value) => updateDocument((current) => ({ ...current, pages: current.pages.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
                <Field label="页面用途" path={"pages." + index + ".purpose"} value={page.purpose} onChange={(value) => updateDocument((current) => ({ ...current, pages: current.pages.map((item, at) => at === index ? { ...item, purpose: value } : item) }))} multiline />
                <ReferenceDisplay label="包含功能" selected={page.featureIds} options={document.features.map(({ id, title }) => ({ id, label: title }))} />
              </article>
            ))}
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-flows">
            <legend><span>05</span> 用户流程</legend>
            {document.userFlows.map((flow, index) => (
              <article className="spec-edit-card" key={flow.id}>
                <ItemIdentity id={flow.id} />
                <Field label="流程名称" path={"userFlows." + index + ".name"} value={flow.name} onChange={(value) => updateDocument((current) => ({ ...current, userFlows: current.userFlows.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
                <StringTextFields title="流程步骤" path={"userFlows." + index + ".steps"} items={flow.steps} onChange={(stepIndex, value) => updateDocument((current) => ({ ...current, userFlows: current.userFlows.map((item, at) => at === index ? { ...item, steps: item.steps.map((step, stepAt) => stepAt === stepIndex ? value : step) } : item) }))} />
              </article>
            ))}
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-integrations">
            <legend><span>06</span> 外部集成</legend>
            {document.integrations.map((integration, index) => (
              <article className="spec-edit-card" key={integration.id}>
                <ItemIdentity id={integration.id} />
                <Field label="集成名称" path={"integrations." + index + ".name"} value={integration.name} onChange={(value) => updateDocument((current) => ({ ...current, integrations: current.integrations.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
                <Field label="集成用途" path={"integrations." + index + ".purpose"} value={integration.purpose} onChange={(value) => updateDocument((current) => ({ ...current, integrations: current.integrations.map((item, at) => at === index ? { ...item, purpose: value } : item) }))} multiline />
                <Field label="约束与前置条件" path={"integrations." + index + ".constraints"} value={integration.constraints} onChange={(value) => updateDocument((current) => ({ ...current, integrations: current.integrations.map((item, at) => at === index ? { ...item, constraints: value } : item) }))} multiline />
              </article>
            ))}
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-constraints">
            <legend><span>07</span> 技术约束</legend>
            <StringTextFields title="技术约束" path="technicalConstraints" items={document.technicalConstraints} onChange={(index, value) => updateTextCollection("technicalConstraints", index, value)} />
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-deliverables">
            <legend><span>08</span> 交付物</legend>
            {document.deliverables.map((deliverable, index) => (
              <article className="spec-edit-card" key={deliverable.id}>
                <ItemIdentity id={deliverable.id} />
                <Field label="交付物名称" path={"deliverables." + index + ".title"} value={deliverable.title} onChange={(value) => updateDocument((current) => ({ ...current, deliverables: current.deliverables.map((item, at) => at === index ? { ...item, title: value } : item) }))} />
                <Field label="交付物说明" path={"deliverables." + index + ".description"} value={deliverable.description} onChange={(value) => updateDocument((current) => ({ ...current, deliverables: current.deliverables.map((item, at) => at === index ? { ...item, description: value } : item) }))} multiline />
              </article>
            ))}
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-milestones">
            <legend><span>09</span> 里程碑与验收标准</legend>
            {document.milestones.map((milestone, index) => (
              <article className="spec-edit-card milestone-edit-card" key={milestone.id}>
                <ItemIdentity id={milestone.id} />
                <Field label="里程碑名称" path={"milestones." + index + ".title"} value={milestone.title} onChange={(value) => updateMilestone(index, { title: value })} />
                <Field label="里程碑目标" path={"milestones." + index + ".description"} value={milestone.description} onChange={(value) => updateMilestone(index, { description: value })} multiline />
                <label className="field">
                  <span>累计自然日 <small>锁定为第 {milestone.dueAfterDays} 天</small></span>
                  <input aria-label={"里程碑 " + milestone.id + " 累计自然日"} type="number" value={milestone.dueAfterDays} disabled />
                </label>
                <ReferenceDisplay label="关联交付物" selected={milestone.deliverableIds} options={document.deliverables.map(({ id, title }) => ({ id, label: title }))} />
                <div className="acceptance-editor">
                  <h3>验收标准与验证方法</h3>
                  {milestone.acceptanceCriteria.map((criterion, criterionIndex) => (
                    <section className="spec-criterion-card" key={criterion.id}>
                      <ItemIdentity id={criterion.id} />
                      <Field label="验收标准" path={"milestones." + index + ".acceptanceCriteria." + criterionIndex + ".description"} value={criterion.description} onChange={(value) => updateMilestone(index, { acceptanceCriteria: milestone.acceptanceCriteria.map((item, at) => at === criterionIndex ? { ...item, description: value } : item) })} multiline />
                      <Field label="验证方法" path={"milestones." + index + ".acceptanceCriteria." + criterionIndex + ".verificationMethod"} value={criterion.verificationMethod} onChange={(value) => updateMilestone(index, { acceptanceCriteria: milestone.acceptanceCriteria.map((item, at) => at === criterionIndex ? { ...item, verificationMethod: value } : item) })} multiline />
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-out-of-scope">
            <legend><span>10</span> 范围外事项</legend>
            <StringTextFields title="不包含的内容" path="outOfScope" items={document.outOfScope} onChange={(index, value) => updateTextCollection("outOfScope", index, value)} />
          </fieldset>

          <fieldset className="spec-editor-section" id="mask-assumptions">
            <legend><span>11</span> 假设</legend>
            <StringTextFields title="当前假设" path="assumptions" items={document.assumptions} onChange={(index, value) => updateTextCollection("assumptions", index, value)} />
          </fieldset>
        </div>
      </SpecFieldIssueProvider>

      {issues.length > 0 ? (
        <div className="spec-errors" role="alert" data-testid="masked-spec-validation-errors">
          <strong>请检查脱敏文字</strong>
          <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      ) : (
        <p className="form-message success" role="status">
          结构与锁定版本一致，可以确认发布。
        </p>
      )}

      <section className="project-form masked-preview-panel">
        <div>
          <p className="eyebrow">PUBLIC PREVIEW</p>
          <h2 className="subsection-title">最终招募预览</h2>
        </div>
        <SpecPreview document={document} />
      </section>

      <label className="choice-card">
        <input
          name="confirmed"
          type="checkbox"
          value="on"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        <span>
          我已确认这是最终预览
          <small>改标题或改预览后需要重新勾选确认。</small>
        </span>
      </label>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      {state.successMessage ? (
        <p className="form-message success" role="status">
          {state.successMessage}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending || blocked}>
        {pending ? "正在发布…" : "确认并发布招募"}
      </button>
    </form>
  );
}

function ItemIdentity({ id }: { id: string }) {
  return <div className="spec-item-actions"><code>{id}</code></div>;
}

function ReferenceDisplay({
  label,
  selected,
  options,
}: {
  label: string;
  selected: string[];
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <fieldset className="reference-choices">
      <legend>{label} · 锁定引用</legend>
      {options.length ? options.map((option) => (
        <label key={option.id}>
          <input type="checkbox" checked={selected.includes(option.id)} disabled readOnly />
          <span>{option.label} · {option.id}</span>
        </label>
      )) : <p className="spec-muted">没有可引用条目。</p>}
    </fieldset>
  );
}

function StringTextFields({
  title,
  path,
  items,
  onChange,
}: {
  title: string;
  path: string;
  items: string[];
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="string-list-editor">
      {items.map((item, index) => (
        <Field
          key={path + "." + index}
          label={title + " " + (index + 1)}
          path={path + "." + index}
          value={item}
          onChange={(value) => onChange(index, value)}
          multiline
        />
      ))}
      {items.length === 0 ? <p className="spec-muted">锁定版本没有此类条目。</p> : null}
    </div>
  );
}
