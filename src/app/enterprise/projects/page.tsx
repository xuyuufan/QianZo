import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { getActorById } from "@/modules/identity/service";
import { getVerifiedUserId } from "@/platform/auth/server";

export const dynamic = "force-dynamic";

export default async function EnterpriseProjectsPage() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE" || !actor.roles.includes("ENTERPRISE")) redirect("/");

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <div><span className="brand">Qianzo</span><span className="topbar-label">企业项目</span></div>
        <form action={signOutAction}><button className="text-button">退出登录</button></form>
      </header>
      <section className="empty-state">
        <p className="eyebrow">你好，{actor.displayName}</p>
        <h1 className="section-title">项目草稿</h1>
        <p className="lede">登录与身份设置已完成。项目创建将在 S0 的下一任务接入。</p>
      </section>
    </main>
  );
}
