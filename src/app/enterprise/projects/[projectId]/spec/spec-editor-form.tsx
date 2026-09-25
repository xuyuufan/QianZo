"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { emptySpecActionState } from "@/app/actions/spec-state";
import { saveSpecVersionAction } from "@/app/actions/specs";
import { SpecField as Field, SpecFieldIssueProvider } from "@/components/spec-field";
import {
  specDocumentSchema,
  type SpecDocumentV1,
  type SpecMilestone,
} from "@/modules/specs/document";
import { describeFieldIssues } from "@/platform/validation";

import { syncEditorWithServer } from "./editor-sync";
import {
  createStableSpecId,
  moveSpecItem,
  specReferenceBlockers,
  type EditableSpecCollection,
} from "./spec-editor-model";

type SpecEditorFormProps = {
  projectId: string;
  version: number;
  initialContent: string;
  onDirtyChange?: (dirty: boolean) => void;
};

export function SpecEditorForm({ projectId, version, initialContent, onDirtyChange }: SpecEditorFormProps) {
  const action = saveSpecVersionAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptySpecActionState);
  const [editorDraft, setEditorDraft] = useState(() => ({
    document: JSON.parse(initialContent) as SpecDocumentV1,
    syncedContent: initialContent,
  }));
  // Fingerprint of the last submitted content, so the server's field messages
  // are only shown while they still describe the draft on screen.
  const [submittedContent, setSubmittedContent] = useState<string | null>(null);
  const serverSync = syncEditorWithServer({
    initialContent,
    content: JSON.stringify(editorDraft.document, null, 2),
    syncedContent: editorDraft.syncedContent,
  });
  const document = serverSync
    ? JSON.parse(serverSync.content) as SpecDocumentV1
    : editorDraft.document;
  const syncedContent = serverSync?.syncedContent ?? editorDraft.syncedContent;
  const content = useMemo(() => JSON.stringify(document, null, 2), [document]);
  const unsaved = content !== syncedContent;

  useEffect(() => {
    onDirtyChange?.(unsaved);
  }, [onDirtyChange, unsaved]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (!unsaved || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.pathname === window.location.pathname && link.search === window.location.search) return;
      if (!window.confirm("Spec 还有未保存修改。确定离开并放弃这些修改吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    window.addEventListener("click", confirmNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      window.removeEventListener("click", confirmNavigation, true);
    };
  }, [unsaved]);

  // The click guard above cannot see the browser's Back/Forward buttons, which
  // move through the App Router's own client history. While there are unsaved
  // edits, park a guard entry on top of the current one so the first Back or
  // Forward can be intercepted: accepting leaves, dismissing re-parks the guard
  // so the user stays on the page with their edits intact.
  useEffect(() => {
    if (!unsaved) return;
    const guardState = { ...window.history.state, qianzoSpecEditorGuard: true };
    let leaving = false;
    window.history.pushState(guardState, "", window.location.href);
    const guardHistory = () => {
      if (leaving) return;
      if (window.confirm("Spec 还有未保存修改。确定离开并放弃这些修改吗？")) {
        leaving = true;
        window.history.go(-1);
      } else {
        window.history.pushState(guardState, "", window.location.href);
      }
    };
    window.addEventListener("popstate", guardHistory);
    return () => {
      window.removeEventListener("popstate", guardHistory);
      // Step back off the guard entry once the edits are saved or abandoned so
      // Back keeps behaving normally and the entries do not accumulate.
      if (window.history.state?.qianzoSpecEditorGuard) {
        window.history.back();
      }
    };
  }, [unsaved]);

  const validation = useMemo(() => {
    const parsed = specDocumentSchema.safeParse(document);
    return {
      success: parsed.success,
      issues: parsed.success ? [] : describeFieldIssues(parsed.error),
      paths: parsed.success ? [] : parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }, [document]);
  const serverFeedbackApplies = submittedContent === content;
  const issues = validation.issues.length ? validation.issues : serverFeedbackApplies ? state.issues : [];
  const set = (update: (current: SpecDocumentV1) => SpecDocumentV1) => setEditorDraft((current) => {
    // Reconcile against the latest server props inside the user event update.
    // A clean editor follows a new candidate; a dirty editor remains local.
    const reconciled = syncEditorWithServer({
      initialContent,
      content: JSON.stringify(current.document, null, 2),
      syncedContent: current.syncedContent,
    });
    const baseDocument = reconciled
      ? JSON.parse(reconciled.content) as SpecDocumentV1
      : current.document;
    return {
      document: update(baseDocument),
      syncedContent: reconciled?.syncedContent ?? current.syncedContent,
    };
  });
  const newId = (prefix: string) => createStableSpecId(prefix);

  function removeItem(collection: EditableSpecCollection, id: string) {
    const blockers = specReferenceBlockers(document, collection, id);
    if (blockers.length) return;
    set((current) => ({ ...current, [collection]: current[collection].filter((item) => item.id !== id) }) as SpecDocumentV1);
  }

  function moveItem(collection: EditableSpecCollection, index: number, offset: -1 | 1) {
    set((current) => ({
      ...current,
      [collection]: moveSpecItem<{ id: string }>(current[collection] as Array<{ id: string }>, index, offset),
    }) as SpecDocumentV1);
  }

  function stringList(
    title: string,
    path: "technicalConstraints" | "outOfScope" | "assumptions",
    description: string,
  ) {
    return (
      <StringListEditor
        title={title}
        path={path}
        description={description}
        items={document[path]}
        onChange={(items) => set((current) => ({ ...current, [path]: items }))}
        newLabel="添加条目"
      />
    );
  }

  return (
    <form action={formAction} onSubmit={() => { setSubmittedContent(content); }} className="project-form spec-structured-form" data-testid="structured-spec-editor">
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="document" type="hidden" value={content} />
      <SpecFieldIssueProvider value={validation.paths}>
      <div className="spec-editor-toolbar">
        <div>
          <p className="eyebrow">STRUCTURED SPEC · V1</p>
          <h2 className="subsection-title">编辑项目范围</h2>
          <p className="spec-muted">条目 ID 会自动生成并保持稳定；里程碑周期是从开工起算的累计自然日。</p>
        </div>
        <span className={unsaved ? "editor-save-state is-dirty" : "editor-save-state"} role="status">
          {unsaved ? "有未保存修改" : "已与当前版本同步"}
        </span>
      </div>

      <fieldset className="spec-editor-section" id="edit-goal">
        <legend><span>01</span> 目标与背景</legend>
        <Field label="项目目标" path="projectGoal" value={document.projectGoal} onChange={(value) => set((current) => ({ ...current, projectGoal: value }))} multiline />
        <Field label="项目背景" path="background" value={document.background} onChange={(value) => set((current) => ({ ...current, background: value }))} multiline optional />
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-roles">
        <legend><span>02</span> 使用者角色</legend>
        <p className="spec-muted">描述谁会使用项目，以及他们的职责。</p>
        {document.userRoles.map((role, index) => {
          const blockers = specReferenceBlockers(document, "userRoles", role.id);
          return (
            <article className="spec-edit-card" key={role.id}>
              <ItemActions id={role.id} index={index} count={document.userRoles.length} onMove={(offset) => moveItem("userRoles", index, offset)} onRemove={() => removeItem("userRoles", role.id)} blocked={blockers.length > 0} />
              <Field label="角色名称" path={`userRoles.${index}.name`} value={role.name} onChange={(value) => set((current) => ({ ...current, userRoles: current.userRoles.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
              <Field label="职责说明" path={`userRoles.${index}.description`} value={role.description} onChange={(value) => set((current) => ({ ...current, userRoles: current.userRoles.map((item, at) => at === index ? { ...item, description: value } : item) }))} multiline />
              {blockers.length ? <p className="spec-reference-note">被功能引用：{blockers.join("、")}。先移除这些引用后才能删除角色。</p> : null}
            </article>
          );
        })}
        <button type="button" className="editor-add-button" onClick={() => set((current) => ({ ...current, userRoles: [...current.userRoles, { id: newId("role"), name: "新使用者角色", description: "补充这个角色的职责。" }] }))}>＋ 添加使用者角色</button>
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-features">
        <legend><span>03</span> 功能范围</legend>
        {document.features.map((feature, index) => {
          const blockers = specReferenceBlockers(document, "features", feature.id);
          return (
            <article className="spec-edit-card" key={feature.id}>
              <ItemActions id={feature.id} index={index} count={document.features.length} onMove={(offset) => moveItem("features", index, offset)} onRemove={() => removeItem("features", feature.id)} blocked={blockers.length > 0} />
              <Field label="功能名称" path={`features.${index}.title`} value={feature.title} onChange={(value) => set((current) => ({ ...current, features: current.features.map((item, at) => at === index ? { ...item, title: value } : item) }))} />
              <Field label="功能说明" path={`features.${index}.description`} value={feature.description} onChange={(value) => set((current) => ({ ...current, features: current.features.map((item, at) => at === index ? { ...item, description: value } : item) }))} multiline />
              <ReferenceChoices label="适用角色" options={document.userRoles.map(({ id, name }) => ({ id, label: `${name} · ${id}` }))} selected={feature.userRoleIds} onToggle={(id) => set((current) => ({ ...current, features: current.features.map((item, at) => at === index ? { ...item, userRoleIds: toggle(item.userRoleIds, id) } : item) }))} />
              {blockers.length ? <p className="spec-reference-note">被页面引用：{blockers.join("、")}。先移除页面引用后才能删除功能。</p> : null}
            </article>
          );
        })}
        <button type="button" className="editor-add-button" onClick={() => set((current) => ({ ...current, features: [...current.features, { id: newId("feature"), title: "新功能", description: "描述功能行为与预期结果。", userRoleIds: [] }] }))}>＋ 添加功能</button>
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-pages">
        <legend><span>04</span> 页面与界面</legend>
        {document.pages.map((page, index) => (
          <article className="spec-edit-card" key={page.id}>
            <ItemActions id={page.id} index={index} count={document.pages.length} onMove={(offset) => moveItem("pages", index, offset)} onRemove={() => removeItem("pages", page.id)} />
            <Field label="页面名称" path={`pages.${index}.name`} value={page.name} onChange={(value) => set((current) => ({ ...current, pages: current.pages.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
            <Field label="页面用途" path={`pages.${index}.purpose`} value={page.purpose} onChange={(value) => set((current) => ({ ...current, pages: current.pages.map((item, at) => at === index ? { ...item, purpose: value } : item) }))} multiline />
            <ReferenceChoices label="包含功能" options={document.features.map(({ id, title }) => ({ id, label: `${title} · ${id}` }))} selected={page.featureIds} onToggle={(id) => set((current) => ({ ...current, pages: current.pages.map((item, at) => at === index ? { ...item, featureIds: toggle(item.featureIds, id) } : item) }))} />
          </article>
        ))}
        <button type="button" className="editor-add-button" onClick={() => set((current) => ({ ...current, pages: [...current.pages, { id: newId("page"), name: "新页面", purpose: "说明页面的使用目的。", featureIds: [] }] }))}>＋ 添加页面</button>
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-flows">
        <legend><span>05</span> 用户流程</legend>
        {document.userFlows.map((flow, index) => (
          <article className="spec-edit-card" key={flow.id}>
            <ItemActions id={flow.id} index={index} count={document.userFlows.length} onMove={(offset) => moveItem("userFlows", index, offset)} onRemove={() => removeItem("userFlows", flow.id)} />
            <Field label="流程名称" path={`userFlows.${index}.name`} value={flow.name} onChange={(value) => set((current) => ({ ...current, userFlows: current.userFlows.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
            <StringListEditor title="流程步骤" path={`userFlows.${index}.steps`} items={flow.steps} onChange={(steps) => set((current) => ({ ...current, userFlows: current.userFlows.map((item, at) => at === index ? { ...item, steps } : item) }))} newLabel="添加步骤" />
          </article>
        ))}
        <button type="button" className="editor-add-button" onClick={() => set((current) => ({ ...current, userFlows: [...current.userFlows, { id: newId("flow"), name: "新用户流程", steps: ["描述第一步"] }] }))}>＋ 添加用户流程</button>
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-integrations">
        <legend><span>06</span> 外部集成</legend>
        {document.integrations.map((integration, index) => (
          <article className="spec-edit-card" key={integration.id}>
            <ItemActions id={integration.id} index={index} count={document.integrations.length} onMove={(offset) => moveItem("integrations", index, offset)} onRemove={() => removeItem("integrations", integration.id)} />
            <Field label="集成名称" path={`integrations.${index}.name`} value={integration.name} onChange={(value) => set((current) => ({ ...current, integrations: current.integrations.map((item, at) => at === index ? { ...item, name: value } : item) }))} />
            <Field label="集成用途" path={`integrations.${index}.purpose`} value={integration.purpose} onChange={(value) => set((current) => ({ ...current, integrations: current.integrations.map((item, at) => at === index ? { ...item, purpose: value } : item) }))} multiline />
            <Field label="约束与前置条件" path={`integrations.${index}.constraints`} value={integration.constraints} onChange={(value) => set((current) => ({ ...current, integrations: current.integrations.map((item, at) => at === index ? { ...item, constraints: value } : item) }))} multiline />
          </article>
        ))}
        <button type="button" className="editor-add-button" onClick={() => set((current) => ({ ...current, integrations: [...current.integrations, { id: newId("integration"), name: "新集成", purpose: "说明集成用途。", constraints: "说明接口、权限或环境约束。" }] }))}>＋ 添加外部集成</button>
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-constraints">
        <legend><span>07</span> 技术约束</legend>
        {stringList("技术约束", "technicalConstraints", "填写平台、兼容性、安全或性能限制。")}
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-deliverables">
        <legend><span>08</span> 交付物</legend>
        {document.deliverables.map((deliverable, index) => {
          const blockers = specReferenceBlockers(document, "deliverables", deliverable.id);
          return (
            <article className="spec-edit-card" key={deliverable.id}>
              <ItemActions id={deliverable.id} index={index} count={document.deliverables.length} onMove={(offset) => moveItem("deliverables", index, offset)} onRemove={() => removeItem("deliverables", deliverable.id)} blocked={blockers.length > 0} />
              <Field label="交付物名称" path={`deliverables.${index}.title`} value={deliverable.title} onChange={(value) => set((current) => ({ ...current, deliverables: current.deliverables.map((item, at) => at === index ? { ...item, title: value } : item) }))} />
              <Field label="交付物说明" path={`deliverables.${index}.description`} value={deliverable.description} onChange={(value) => set((current) => ({ ...current, deliverables: current.deliverables.map((item, at) => at === index ? { ...item, description: value } : item) }))} multiline />
              {blockers.length ? <p className="spec-reference-note">被里程碑引用：{blockers.join("、")}。先移除里程碑引用后才能删除交付物。</p> : null}
            </article>
          );
        })}
        <button type="button" className="editor-add-button" onClick={() => set((current) => ({ ...current, deliverables: [...current.deliverables, { id: newId("deliverable"), title: "新交付物", description: "说明交付内容与形式。" }] }))}>＋ 添加交付物</button>
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-milestones">
        <legend><span>09</span> 里程碑与验收标准</legend>
        <p className="spec-muted">每个里程碑都必须有至少一条验收标准；累计周期严格递增。</p>
        {document.milestones.map((milestone, index) => (
          <article className="spec-edit-card milestone-edit-card" key={milestone.id}>
            <ItemActions id={milestone.id} index={index} count={document.milestones.length} onMove={(offset) => moveItem("milestones", index, offset)} onRemove={() => removeItem("milestones", milestone.id)} />
            <Field label="里程碑名称" path={`milestones.${index}.title`} value={milestone.title} onChange={(value) => updateMilestone(index, { title: value })} />
            <Field label="里程碑目标" path={`milestones.${index}.description`} value={milestone.description} onChange={(value) => updateMilestone(index, { description: value })} multiline />
            <label className="field">
              <span>累计自然日 <small>从开工日计算，到第 {milestone.dueAfterDays} 天</small></span>
              <input aria-label={`里程碑 ${milestone.id} 累计自然日`} type="number" min={1} max={3650} step={1} value={milestone.dueAfterDays} aria-invalid={hasError(`milestones.${index}.dueAfterDays`)} onChange={(event) => updateMilestone(index, { dueAfterDays: Number(event.currentTarget.value) })} />
              <FieldError path={`milestones.${index}.dueAfterDays`} paths={validation.paths} />
            </label>
            <ReferenceChoices label="关联交付物" options={document.deliverables.map(({ id, title }) => ({ id, label: `${title} · ${id}` }))} selected={milestone.deliverableIds} onToggle={(id) => updateMilestone(index, { deliverableIds: toggle(milestone.deliverableIds, id) })} />
            <div className="acceptance-editor">
              <h3>验收标准与验证方法</h3>
              {milestone.acceptanceCriteria.map((criterion, criterionIndex) => (
                <section className="spec-criterion-card" key={criterion.id}>
                  <ItemActions id={criterion.id} index={criterionIndex} count={milestone.acceptanceCriteria.length} onMove={(offset) => updateMilestone(index, { acceptanceCriteria: moveSpecItem(milestone.acceptanceCriteria, criterionIndex, offset) })} onRemove={() => updateMilestone(index, { acceptanceCriteria: milestone.acceptanceCriteria.filter((item) => item.id !== criterion.id) })} />
                  <Field label="验收标准" path={`milestones.${index}.acceptanceCriteria.${criterionIndex}.description`} value={criterion.description} onChange={(value) => updateMilestone(index, { acceptanceCriteria: milestone.acceptanceCriteria.map((item, at) => at === criterionIndex ? { ...item, description: value } : item) })} multiline />
                  <Field label="验证方法" path={`milestones.${index}.acceptanceCriteria.${criterionIndex}.verificationMethod`} value={criterion.verificationMethod} onChange={(value) => updateMilestone(index, { acceptanceCriteria: milestone.acceptanceCriteria.map((item, at) => at === criterionIndex ? { ...item, verificationMethod: value } : item) })} multiline />
                </section>
              ))}
              <button type="button" className="editor-add-button compact" onClick={() => updateMilestone(index, { acceptanceCriteria: [...milestone.acceptanceCriteria, { id: newId(`criterion-${index + 1}`), description: "描述可验证的完成条件。", verificationMethod: "说明验证步骤与结果。" }] })}>＋ 添加验收标准</button>
            </div>
          </article>
        ))}
        <button type="button" className="editor-add-button" onClick={() => {
          const previous = document.milestones.at(-1)?.dueAfterDays ?? 0;
          set((current) => ({ ...current, milestones: [...current.milestones, createMilestone(newId("milestone"), previous + 7)] }));
        }}>＋ 添加里程碑</button>
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-out-of-scope">
        <legend><span>10</span> 范围外事项</legend>
        {stringList("不包含的内容", "outOfScope", "明确本项目不会交付的事项。")}
      </fieldset>

      <fieldset className="spec-editor-section" id="edit-assumptions">
        <legend><span>11</span> 假设</legend>
        {stringList("当前假设", "assumptions", "列出成立时依赖的前提。")}
      </fieldset>

      {issues.length ? (
        <div className="spec-errors" role="alert" data-testid="spec-validation-errors">
          <strong>请修正以下字段后再保存</strong>
          <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      ) : <p className="form-message success" role="status">结构校验通过。保存会新增一个 Spec 版本，历史版本不会被覆盖。</p>}
      {state.message ? <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>{state.message}</p> : null}
      {state.errorCode === "VERSION_CONFLICT" ? <button type="button" className="text-button" onClick={() => { if (window.confirm("重新加载会放弃当前未保存的修改。确定继续吗？")) window.location.reload(); }}>放弃修改并重新加载</button> : null}
      {state.successMessage ? <p className="form-message success" role="status">{state.successMessage}</p> : null}
      <div className="form-actions spec-editor-actions">
        <button className="button" type="submit" disabled={pending || !validation.success}>
          {pending ? "正在保存新版本…" : "保存为新版本"}
        </button>
        {unsaved ? <span className="spec-muted">离开编辑页会提示你确认是否放弃修改。</span> : null}
      </div>
      </SpecFieldIssueProvider>
    </form>
  );

  function updateMilestone(index: number, update: Partial<SpecMilestone>) {
    set((current) => ({ ...current, milestones: current.milestones.map((item, at) => at === index ? { ...item, ...update } : item) }));
  }

  function hasError(path: string) {
    return validation.paths.some((issue) => issue.path === path);
  }
}

function createMilestone(id: string, dueAfterDays: number): SpecMilestone {
  return {
    id,
    title: "新里程碑",
    description: "说明这个阶段要完成的工作。",
    dueAfterDays,
    deliverableIds: [],
    acceptanceCriteria: [{
      id: createStableSpecId(`${id}-criterion`),
      description: "描述可验证的完成条件。",
      verificationMethod: "说明验证步骤与结果。",
    }],
  };
}

function toggle(values: readonly string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function FieldError({ path, paths }: { path: string; paths: Array<{ path: string; message: string }> }) {
  const issue = paths.find((item) => item.path === path);
  return issue ? <small className="field-error">{issue.message}</small> : null;
}

function ItemActions({
  id,
  index,
  count,
  onMove,
  onRemove,
  blocked = false,
}: {
  id: string;
  index: number;
  count: number;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  blocked?: boolean;
}) {
  return (
    <div className="spec-item-actions">
      <code>{id}</code>
      <div>
        <button type="button" aria-label={`上移 ${id}`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" aria-label={`下移 ${id}`} disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
        <button type="button" aria-label={`删除 ${id}`} disabled={blocked} title={blocked ? "请先解除该条目的引用" : undefined} onClick={onRemove}>删除</button>
      </div>
    </div>
  );
}

function ReferenceChoices({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="reference-choices">
      <legend>{label}</legend>
      {options.length ? options.map((option) => (
        <label key={option.id}>
          <input type="checkbox" checked={selected.includes(option.id)} onChange={() => onToggle(option.id)} />
          <span>{option.label}</span>
        </label>
      )) : <p className="spec-muted">先添加可引用条目。</p>}
    </fieldset>
  );
}

function StringListEditor({
  title,
  path,
  description,
  items,
  onChange,
  newLabel,
}: {
  title: string;
  path: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
  newLabel: string;
}) {
  return (
    <div className="string-list-editor">
      <div><h3>{title}</h3>{description ? <p className="spec-muted">{description}</p> : null}</div>
      {items.map((item, index) => (
        <div className="string-list-row" key={`${title}-${index}`}>
          <Field label={`${title} ${index + 1}`} path={`${path}.${index}`} value={item} onChange={(value) => onChange(items.map((entry, at) => at === index ? value : entry))} multiline />
          <div className="string-row-actions">
            <button type="button" aria-label={`上移${title} ${index + 1}`} disabled={index === 0} onClick={() => onChange(moveSpecItem(items, index, -1))}>↑</button>
            <button type="button" aria-label={`下移${title} ${index + 1}`} disabled={index === items.length - 1} onClick={() => onChange(moveSpecItem(items, index, 1))}>↓</button>
            <button type="button" onClick={() => onChange(items.filter((_, at) => at !== index))}>删除</button>
          </div>
        </div>
      ))}
      <button type="button" className="editor-add-button compact" onClick={() => onChange([...items, "补充说明。"])}>＋ {newLabel}</button>
    </div>
  );
}
