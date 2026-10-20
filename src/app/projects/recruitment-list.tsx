"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RecruitmentSummary } from "@/modules/recruitment/snapshot";

export function RecruitmentList({ recruitments }: { recruitments: RecruitmentSummary[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("zh-CN");
    if (!search) return recruitments;
    return recruitments.filter((recruitment) =>
      `${recruitment.title}\n${recruitment.goal}`.toLocaleLowerCase("zh-CN").includes(search),
    );
  }, [query, recruitments]);

  return (
    <>
      {recruitments.length > 0 ? (
        <div className="mt-10 flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-end">
          <label className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors focus-within:border-foreground sm:w-80">
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            <input
              aria-label="搜索招募项目"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="搜索项目标题或目标"
              className="min-w-0 flex-1 bg-transparent font-zh text-sm outline-none placeholder:text-muted-foreground/70"
            />
            {query ? (
              <Button type="button" variant="ghost" size="icon-sm" className="size-6" aria-label="清空搜索" onClick={() => setQuery("")}>
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </label>
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {query.trim() ? `${filtered.length} 个匹配项目，共 ${recruitments.length} 个` : `${recruitments.length} 个招募项目`}
          </span>
        </div>
      ) : null}

      {recruitments.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-zh text-sm text-muted-foreground">还没有已发布的项目</p>
          <p className="mt-2 font-zh text-xs text-muted-foreground">企业锁定范围并完成模拟定金后，项目才会出现在这里。</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center" role="status">
          <p className="font-zh text-sm text-muted-foreground">没有匹配的项目</p>
          <p className="mt-2 font-zh text-xs text-muted-foreground">换一个标题或目标关键词再试试。</p>
          <Button variant="ghost" size="sm" className="mt-3 font-zh" onClick={() => setQuery("")}>清除搜索</Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="recruitment-results">
          {filtered.map((recruitment) => (
            <Link
              key={recruitment.projectId}
              href={`/projects/${recruitment.projectId}`}
              className="group flex min-h-72 min-w-0 flex-col rounded-md border border-border bg-card p-6 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between font-brand text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <span>OPEN</span>
                <span className="flex items-center gap-1.5 font-zh normal-case tracking-normal">
                  <span className="size-1.5 rounded-full bg-builder" />
                  Spec 已确认
                </span>
              </div>
              <h2 className="mt-5 font-zh text-base font-normal text-foreground">{recruitment.title}</h2>
              <p className="mt-2 flex-1 font-zh text-sm leading-6 text-muted-foreground">{recruitment.goal}</p>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 font-zh text-xs">
                <span className="min-w-0 truncate">
                  参考预算 {recruitment.budgetLabel}
                  <span className="ml-2 text-muted-foreground">· {recruitment.deliveryDays} 个自然日</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground group-hover:text-foreground">
                  查看项目
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
