import { redirect } from "next/navigation";
import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import { getActorById } from "@/modules/identity/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const userId = await getVerifiedUserId();
  if (!userId) {
    redirect("/sign-in");
  }
  const actor = await getActorById(userId);
  const { intent: rawIntent } = await searchParams;
  const intent = rawIntent === "requester" || rawIntent === "builder" ? rawIntent : undefined;

  if (actor?.status === "DISABLED") {
    return (
    <main className="auth-shell auth-brand-shell">
      <section className="auth-card auth-brand-card">
          <h1 className="section-title">账号已停用</h1>
          <p className="lede">此账号目前无法使用 Qianzo。</p>
          <form action={signOutAction}><button className="button secondary">退出登录</button></form>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell auth-brand-shell">
      <section className="auth-card auth-brand-card" aria-labelledby="onboarding-title">
        <div>
          <Link className="brand" href="/">QIANZO <span>千轴</span></Link>
          <p className="eyebrow">{actor ? "身份设置" : "首次设置"}</p>
          <h1 id="onboarding-title" className="section-title">选择你的参与方式</h1>
          <p className="lede">身份可同时选择；以后增加身份不会移除已有身份。</p>
        </div>
        <OnboardingForm defaultDisplayName={actor?.displayName} defaultRoles={actor?.roles} intent={intent} />
        <form action={signOutAction}><button className="text-button">退出登录</button></form>
      </section>
    </main>
  );
}
