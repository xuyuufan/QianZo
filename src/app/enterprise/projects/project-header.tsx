import Link from "next/link";
import { ArrowRight, LogOut } from "lucide-react";

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
    <header className="topbar product-topbar">
      <div className="product-brand-group">
        <Link className="brand" href={homeHref}><span className="brand-mark">Q</span><span>QIANZO</span></Link>
        <span className="topbar-label">{label}</span>
      </div>
      <div className="topbar-actions">
        <Link className="product-nav-link" href={homeHref}>我的项目</Link>
        <Link className="product-nav-link" href="/projects">项目大厅 <ArrowRight aria-hidden="true" /></Link>
        <form action={signOutAction}><button className="product-signout"><LogOut aria-hidden="true" />退出登录</button></form>
      </div>
    </header>
  );
}
