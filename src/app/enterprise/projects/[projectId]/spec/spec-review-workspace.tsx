"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";

import { SpecDocumentView } from "@/components/spec-document-view";
import type { SpecDocumentV1 } from "@/modules/specs/document";

import { AdoptCandidateForm } from "./adopt-candidate-form";
import { LockSpecForm } from "./lock-spec-form";
import { clearSpecDraftFor } from "./spec-draft";
import { SpecEditorForm } from "./spec-editor-form";

type SpecVersionView = {
  id: string;
  versionNo: number;
  sourceMessageId: string | null;
  createdAt: string;
  document: SpecDocumentV1 | null;
};

type CandidateView = {
  sourceMessageId: string;
  createdAt: string;
  document: SpecDocumentV1;
};

type Panel = "current" | "candidate" | "history" | "edit";

type SpecReviewWorkspaceProps = {
  projectId: string;
  projectVersion: number;
  projectTitle: string;
  originalRequirement: string;
  budgetLabel: string | null;
  lockedAt: string | null;
  locked: boolean;
  current: SpecVersionView | null;
  versions: SpecVersionView[];
  candidate: CandidateView | null;
  candidateMatchesProjectVersion: boolean;
  candidateAdoptedVersionNo: number | null;
  initialHistoryVersionId: string | null;
  editorDocument: SpecDocumentV1;
};

const momentFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  const tabs = event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>("[role=tab]");
  if (!tabs?.length) return;

  const index = Array.from(tabs).indexOf(event.currentTarget);
  const nextIndex = event.key === "ArrowRight"
    ? (index + 1) % tabs.length
    : event.key === "ArrowLeft"
      ? (index - 1 + tabs.length) % tabs.length
      : event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : null;
  if (nextIndex === null) return;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

export function SpecReviewWorkspace({
  projectId,
  projectVersion,
  projectTitle,
  originalRequirement,
  budgetLabel,
  lockedAt,
  locked,
  current,
  versions,
  candidate,
  candidateMatchesProjectVersion,
  candidateAdoptedVersionNo,
  initialHistoryVersionId,
  editorDocument,
}: SpecReviewWorkspaceProps) {
  const initialPanel: Panel = initialHistoryVersionId
    ? "history"
    : candidate && !candidateAdoptedVersionNo
      ? "candidate"
      : current?.document
        ? "current"
        : "edit";
  const [activePanel, setActivePanel] = useState<Panel>(initialPanel);
  const [selectedVersionId, setSelectedVersionId] = useState(
    initialHistoryVersionId ?? current?.id ?? versions[0]?.id ?? "",
  );
  const [editorDirty, setEditorDirty] = useState(false);
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? current ?? versions[0] ?? null;

  const tabs: Array<{ id: Panel; label: string }> = [
    ...(current?.document ? [{ id: "current" as const, label: "当前版本" }] : []),
    ...(candidate ? [{ id: "candidate" as const, label: "访谈候选" }] : []),
    ...(versions.length > 0 ? [{ id: "history" as const, label: "版本历史" }] : []),
    { id: "edit", label: "编辑 Spec" },
  ];

  function selectPanel(next: Panel) {
    if (activePanel === "edit" && next !== "edit" && editorDirty) {
      const leave = window.confirm(
        "Spec 有未保存修改。切换视图会保留编辑内容；确定离开编辑视图吗？",
      );
      if (!leave) return;
    }
    setActivePanel(next);
  }

  function selectVersion(versionId: string) {
    setSelectedVersionId(versionId);
    // The page already serves ?version= deep links, so keep the address in step
    // with the record on screen: a reload, a copied URL or a return through
    // history then reopens the same version instead of the current one.
    // replaceState is a pure address-bar update, so the router does not treat it
    // as a navigation and the in-page state (including unsaved edits) survives.
    const url = new URL(window.location.href);
    url.searchParams.set("version", versionId);
    window.history.replaceState(
      { ...window.history.state },
      "",
      `${url.pathname}${url.search}`,
    );
  }

  return (
    <section className="min-w-0" aria-label="Spec 工作区">
      <div className="flex flex-col gap-4 border-b border-border sm:flex-row sm:items-end sm:justify-between">
        <div className="pb-4">
          <p className="font-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Spec document · v1
          </p>
          <h2 className="mt-2 font-zh text-xl font-normal">项目范围</h2>
        </div>
        <div className="flex max-w-full gap-5 overflow-x-auto" role="tablist" aria-label="Spec 视图">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`spec-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activePanel === tab.id}
              aria-controls={`spec-panel-${tab.id}`}
              onClick={() => selectPanel(tab.id)}
              onKeyDown={handleTabKeyDown}
              className={`relative h-11 shrink-0 rounded-none px-0 font-brand text-xs text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground ${
                activePanel === tab.id
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-foreground"
                  : ""
              }`}
            >
              {tab.label}
              {tab.id === "candidate" && activePanel !== "candidate" ? (
                <span className="ml-2 size-1.5 rounded-full bg-requester" aria-label="有新候选" />
              ) : null}
              {tab.id === "edit" && editorDirty ? (
                <span className="ml-2 size-1.5 rounded-full bg-requester" aria-label="有未保存修改" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {current?.document ? (
        <section
          id="spec-panel-current"
          role="tabpanel"
          aria-labelledby="spec-tab-current"
          hidden={activePanel !== "current"}
          className="min-w-0 pt-8"
          data-testid="current-spec-view"
        >
          <VersionMeta version={current} current />
          <SpecDocumentView document={current.document} idPrefix="current-" />
        </section>
      ) : null}

      {candidate ? (
        <section
          id="spec-panel-candidate"
          role="tabpanel"
          aria-labelledby="spec-tab-candidate"
          hidden={activePanel !== "candidate"}
          className="min-w-0 pt-8"
          data-testid="spec-candidate-panel"
        >
          <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Review candidate</p>
              <h3 className="mt-2 font-zh text-lg font-normal">最新候选 Spec</h3>
              <p className="mt-2 font-zh text-xs text-muted-foreground">
                {momentFormat.format(new Date(candidate.createdAt))} · 项目版本 {projectVersion}
              </p>
              {editorDirty ? <p className="mt-2 font-zh text-xs text-requester">编辑器中的未保存修改仍保留；候选不会覆盖它。</p> : null}
            </div>
            {candidateAdoptedVersionNo !== null ? (
              <p className="font-zh text-xs text-builder" role="status">
                该候选已采用为版本 {candidateAdoptedVersionNo}，历史版本不会被覆盖。
              </p>
            ) : locked ? (
              <p className="font-zh text-xs text-muted-foreground" role="status">
                范围已锁定，此候选仅作为历史保留。
              </p>
            ) : candidateMatchesProjectVersion ? (
              <AdoptCandidateForm
                projectId={projectId}
                version={projectVersion}
                sourceMessageId={candidate.sourceMessageId}
              />
            ) : (
              <p className="max-w-sm font-zh text-xs leading-5 text-destructive" role="alert" data-error-code="STALE_PROPOSAL">
                该候选基于更早的项目版本，已过期：请重新生成候选，或手工编辑后另存为新版本。
              </p>
            )}
          </div>
          <SpecDocumentView document={candidate.document} idPrefix="candidate-" />
        </section>
      ) : null}

      {versions.length > 0 ? (
        <section
          id="spec-panel-history"
          role="tabpanel"
          aria-labelledby="spec-tab-history"
          hidden={activePanel !== "history"}
          className="min-w-0 pt-8"
        >
          <div className="mb-7 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Append-only history</p>
              <h3 className="mt-2 font-zh text-lg font-normal">只读版本记录</h3>
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto" aria-label="Spec 历史版本">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  aria-pressed={selectedVersion?.id === version.id}
                  onClick={() => selectVersion(version.id)}
                  className={`shrink-0 border px-3 py-2 font-brand text-xs transition-colors ${
                    selectedVersion?.id === version.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  v{version.versionNo}{version.id === current?.id ? " · 当前" : ""}
                </button>
              ))}
            </div>
          </div>
          {selectedVersion ? (
            <div data-testid="spec-version-detail">
              <VersionMeta version={selectedVersion} current={selectedVersion.id === current?.id} />
              {selectedVersion.document ? (
                <SpecDocumentView document={selectedVersion.document} idPrefix="history-" />
              ) : (
                <p className="border-y border-border py-4 font-zh text-sm text-muted-foreground">
                  这个版本无法通过当前 Spec 校验，只读保留，不能修改。
                </p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        id="spec-panel-edit"
        role="tabpanel"
        aria-labelledby="spec-tab-edit"
        hidden={activePanel !== "edit"}
        className="min-w-0 pt-8"
      >
        {locked ? (
          <p className="border-y border-border py-5 font-zh text-sm text-muted-foreground" role="status">
            范围已锁定，不能再另存新版本；如需调整范围，S1 不提供解锁流程。
          </p>
        ) : (
          <SpecEditorForm
            projectId={projectId}
            version={projectVersion}
            initialContent={JSON.stringify(editorDocument, null, 2)}
            onDirtyChange={setEditorDirty}
          />
        )}
      </section>

      <section className="spec-lock-scope mt-10 border-t border-border pt-8" aria-label="锁定评审范围">
        <div className="mb-5">
          <p className="font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Scope approval</p>
          <h2 className="mt-2 font-zh text-lg font-normal">锁定评审范围</h2>
          <p className="mt-2 max-w-2xl font-zh text-xs leading-5 text-muted-foreground">
            锁定会冻结当前 Spec 版本、项目标题、原始需求和参考预算；S1 不提供解锁。
          </p>
        </div>
        {locked ? (
          <div className="border-l border-builder pl-4 font-zh text-sm leading-6">
            <p role="status">已锁定 Spec 版本 {current?.versionNo ?? "—"}{lockedAt ? ` · ${lockedAt}` : ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">参考预算 {budgetLabel ?? "未填写"} · 标题、原始需求与该版本均已冻结。</p>
            <Link className="mt-3 inline-flex text-xs text-foreground underline decoration-border underline-offset-4" href={`/enterprise/projects/${projectId}/publish`}>
              下一步：模拟企业定金并准备招募 →
            </Link>
          </div>
        ) : current ? (
          budgetLabel ? editorDirty ? (
            <div className="border-y border-border py-4">
              <p className="font-zh text-sm" role="status">Spec 有未保存修改，先保存新版本或明确放弃修改后再锁定。</p>
              <div className="mt-3 flex flex-wrap gap-4">
                <button type="button" className="font-zh text-xs underline decoration-border underline-offset-4" onClick={() => setActivePanel("edit")}>
                  返回编辑 Spec
                </button>
                <button type="button" className="font-zh text-xs text-muted-foreground underline decoration-border underline-offset-4" onClick={() => {
                  // The draft the editor mirrors is recoverable on purpose, so
                  // discarding has to drop it first or the reload restores it.
                  clearSpecDraftFor(projectId);
                  window.location.reload();
                }}>
                  放弃修改并重新加载
                </button>
              </div>
            </div>
          ) : (
            <LockSpecForm
              projectId={projectId}
              version={projectVersion}
              specVersionId={current.id}
              specVersionNo={current.versionNo}
              title={projectTitle}
              originalRequirement={originalRequirement}
              budgetLabel={budgetLabel}
            />
          ) : (
            <p className="max-w-md font-zh text-xs leading-5 text-destructive" role="alert" data-error-code="INVALID_PROPOSAL">
              锁定前请先在项目总览补齐参考预算上下限。
            </p>
          )
        ) : (
          <p className="max-w-md font-zh text-xs leading-5 text-muted-foreground">
            还没有保存过 Spec 版本。先采用访谈候选或手工保存一版，再进行锁定。
          </p>
        )}
      </section>
    </section>
  );
}

function VersionMeta({ version, current }: { version: SpecVersionView; current: boolean }) {
  return (
    <div className="mb-6 border-y border-border py-3">
      <h3 className="font-zh text-base font-normal">Spec 版本 {version.versionNo}（{current ? "当前" : "历史"}）</h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 font-zh text-xs text-muted-foreground">
        <span>{current ? "当前版本" : "这是历史版本，不会被修改"}</span>
        <span>{version.sourceMessageId ? "访谈候选采用" : "手工保存"}</span>
        <time dateTime={version.createdAt}>{momentFormat.format(new Date(version.createdAt))}</time>
      </div>
    </div>
  );
}
