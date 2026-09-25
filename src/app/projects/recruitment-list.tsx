"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { RecruitmentSummary } from "@/modules/recruitment/snapshot";

const momentFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeZone: "Asia/Shanghai",
});

export function RecruitmentList({ recruitments }: { recruitments: RecruitmentSummary[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("zh-CN");
    if (!search) return recruitments;
    return recruitments.filter((recruitment) =>
      recruitment.title.toLocaleLowerCase("zh-CN").includes(search)
      || recruitment.goal.toLocaleLowerCase("zh-CN").includes(search),
    );
  }, [query, recruitments]);

  return (
    <>
      {recruitments.length > 0 ? (
        <div className="recruitment-toolbar">
          <label className="field" htmlFor="recruitment-search">
            <span>搜索项目标题或目标</span>
            <input
              id="recruitment-search"
              aria-label="搜索招募项目"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="输入标题或目标关键词"
            />
          </label>
          <span className="spec-count" aria-live="polite">
            {query.trim() ? `${filtered.length} / ${recruitments.length} 个项目` : `${recruitments.length} 个项目`}
          </span>
        </div>
      ) : null}

      {recruitments.length === 0 ? (
        <div className="empty-state workspace-empty">
          <span className="empty-symbol" aria-hidden="true">＋</span>
          <p className="eyebrow">OPEN RECRUITMENTS</p>
          <h2>还没有已发布的项目</h2>
          <p className="lede">企业锁定范围并完成模拟定金后，项目才会出现在这里。</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state workspace-empty" role="status">
          <span className="empty-symbol" aria-hidden="true">⌕</span>
          <p className="eyebrow">NO MATCHES</p>
          <h2>没有匹配的项目</h2>
          <p className="lede">换一个标题或目标关键词再试试。</p>
        </div>
      ) : (
        <ul className="project-list project-card-list recruitment-results" data-testid="recruitment-results">
          {filtered.map((recruitment) => (
            <li key={recruitment.projectId}>
              <Link href={`/projects/${recruitment.projectId}`}>
                <span>
                  <small className="project-card-kicker">OPEN · 项目招募</small>
                  <strong>{recruitment.title}</strong>
                  <small>{recruitment.goal}</small>
                  <small>
                    参考预算 {recruitment.budgetLabel} · 预计 {recruitment.deliveryDays} 个自然日 ·{" "}
                    {recruitment.milestoneCount} 个里程碑 · 发布于 {momentFormat.format(recruitment.publishedAt)}
                  </small>
                </span>
                <span className="status-pill status-open">查看详情 →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
