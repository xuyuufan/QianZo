"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "requester" | "builder";

const baseClass = "relative flex items-center text-muted-foreground transition-colors hover:text-foreground";

export function ProductNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const activeClass = role === "requester" ? "text-foreground after:bg-requester" : "text-foreground after:bg-builder";
  const linkClass = (active: boolean) =>
    `${baseClass} ${active ? `${activeClass} after:absolute after:inset-x-0 after:bottom-0 after:h-px` : ""}`;

  if (role === "builder") {
    const active = pathname.startsWith("/projects");
    return (
      <nav className="flex h-14 items-stretch gap-5 font-zh text-xs" aria-label="开发者导航">
        <Link href="/projects" className={linkClass(active)} aria-current={active ? "page" : undefined}>
          项目大厅
        </Link>
      </nav>
    );
  }

  const isStarting = pathname === "/enterprise/projects/new";
  const isMyProjects = pathname.startsWith("/enterprise/projects") && !isStarting;

  return (
    <nav className="flex h-14 items-stretch gap-5 font-zh text-xs" aria-label="需求方导航">
      <Link href="/enterprise/projects/new" className={linkClass(isStarting)} aria-current={isStarting ? "page" : undefined}>
        开始需求
      </Link>
      <Link href="/enterprise/projects" className={linkClass(isMyProjects)} aria-current={isMyProjects ? "page" : undefined}>
        我的项目
      </Link>
    </nav>
  );
}
