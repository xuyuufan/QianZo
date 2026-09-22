import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { getActorById } from "@/modules/identity/service";
import { getVerifiedUserId } from "@/platform/auth/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");

  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status === "DISABLED") redirect("/onboarding");
  if (actor.roles.includes("ENTERPRISE")) redirect("/enterprise/projects");

  return (
    <main className="auth-shell">
      <section className="panel" aria-labelledby="page-title">
        <p className="eyebrow">Builder</p>
        <h1 id="page-title" className="section-title">已登录</h1>
        <p className="lede">接单功能将在后续切片开放。</p>
        <form action={signOutAction}><button className="button secondary">退出登录</button></form>
      </section>
    </main>
  );
}
