import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";

type ProjectHeaderProps = {
  label?: string;
  homeHref?: string;
};

export function ProjectHeader({
  label = "企业项目",
  homeHref = "/enterprise/projects",
}: ProjectHeaderProps = {}) {
  return (
    <header className="topbar">
      <div>
        <Link className="brand" href={homeHref}>Qianzo</Link>
        <span className="topbar-label">{label}</span>
      </div>
      <div className="topbar-actions">
        <Link className="text-button" href="/projects">招募浏览</Link>
        <form action={signOutAction}><button className="text-button">退出登录</button></form>
      </div>
    </header>
  );
}
