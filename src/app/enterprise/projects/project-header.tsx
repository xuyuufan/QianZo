import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";

export function ProjectHeader() {
  return (
    <header className="topbar">
      <div>
        <Link className="brand" href="/enterprise/projects">Qianzo</Link>
        <span className="topbar-label">企业项目</span>
      </div>
      <form action={signOutAction}><button className="text-button">退出登录</button></form>
    </header>
  );
}
