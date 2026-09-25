import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import type { UserRole } from "@/platform/db/schema";

import { ProductNav } from "./product-nav";

export type HeaderRole = "requester" | "builder";

type ProjectHeaderProps = {
  label?: string;
  homeHref?: string;
  role?: HeaderRole;
  fullBleed?: boolean;
  /**
   * Every role the signed-in actor holds. The "switch role" link is only shown
   * when there is more than one role to switch between, so it never points at a
   * route the actor cannot reach (the home "/" always resolves to the
   * ENTERPRISE side first, which made the link a no-op for requesters).
   */
  availableRoles?: HeaderRole[];
};

/** Maps the platform roles an actor holds to the header's role vocabulary. */
export function projectHeaderRoles(roles: readonly UserRole[]): HeaderRole[] {
  const mapped: HeaderRole[] = [];
  if (roles.includes("ENTERPRISE")) mapped.push("requester");
  if (roles.includes("BUILDER")) mapped.push("builder");
  return mapped;
}

export function ProjectHeader({
  label = "企业项目",
  homeHref = "/enterprise/projects",
  role = homeHref === "/projects" ? "builder" : "requester",
  fullBleed = false,
  availableRoles = [],
}: ProjectHeaderProps = {}) {
  const canSwitchRole = availableRoles.length > 1;
  const switchHref = role === "requester" ? "/projects" : "/enterprise/projects";
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
          {canSwitchRole ? (
            <Link href={switchHref} className="hover:text-foreground">重新选择身份</Link>
          ) : null}
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
