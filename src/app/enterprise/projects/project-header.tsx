import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";

import { ProductNav } from "./product-nav";

type ProjectHeaderProps = {
  label?: string;
  homeHref?: string;
  role?: "requester" | "builder";
  fullBleed?: boolean;
};

export function ProjectHeader({
  label = "企业项目",
  homeHref = "/enterprise/projects",
  role = homeHref === "/projects" ? "builder" : "requester",
  fullBleed = false,
}: ProjectHeaderProps = {}) {
  return (
    <header className={`${fullBleed ? "" : "-mx-[clamp(1rem,4vw,3.5rem)]"} sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-sm`} aria-label={`${label}导航`}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-6 sm:gap-8">
          <Link href="/" className="flex items-baseline gap-2" aria-label="千轴首页">
            <span className="font-brand text-xs font-medium uppercase tracking-[0.22em]">QIANZO</span>
            <span className="hidden font-zh text-xs text-muted-foreground sm:inline">千轴</span>
          </Link>
          <ProductNav role={role} />
        </div>
        <div className="flex shrink-0 items-center gap-4 font-zh text-xs text-muted-foreground">
          <span className="hidden items-center gap-2 sm:flex">
            <span className={`size-1.5 rounded-full ${role === "requester" ? "bg-requester" : "bg-builder"}`} />
            {role === "requester" ? "需求方" : "开发者"}
          </span>
          <Link href="/" className="hover:text-foreground">重新选择身份</Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              退出
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
