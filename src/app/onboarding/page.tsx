import { redirect } from "next/navigation";
import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import { getActorById } from "@/modules/identity/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");

  const actor = await getActorById(userId);
  const { intent: rawIntent } = await searchParams;
  const intent = rawIntent === "requester" || rawIntent === "builder" ? rawIntent : undefined;

  if (actor?.status === "DISABLED") {
    return (
      <div className="qz-paper grid min-h-[100svh] place-items-center px-5 py-12">
        <main className="qz-rise w-full max-w-sm rounded-[10px] border border-border bg-card p-7 sm:p-8" aria-labelledby="disabled-title">
          <div className="mb-6 flex items-center gap-2 font-brand text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-destructive" />
            Qianzo account
          </div>
          <h1 id="disabled-title" className="font-zh text-2xl font-normal">账号已停用</h1>
          <p className="mt-2 font-zh text-sm text-muted-foreground">此账号目前无法使用 Qianzo。</p>
          <form action={signOutAction} className="mt-7">
            <button
              type="submit"
              className="w-full rounded-lg bg-foreground py-3 font-zh text-sm text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              退出
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="qz-paper grid min-h-[100svh] place-items-center px-5 py-12">
      <div className="qz-rise w-full max-w-sm">
        <Link
          href="/"
          className="rounded-sm font-brand text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← QIANZO 千轴
        </Link>
        <main className="mt-10 rounded-[10px] border border-border bg-card p-7 sm:p-8" aria-labelledby="onboarding-title">
          <div className="mb-6 flex items-center gap-2 font-brand text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-requester" />
            {actor ? "身份设置" : "首次设置"}
          </div>
          <h1 id="onboarding-title" className="font-zh text-2xl font-normal">选择你的参与方式</h1>
          <p className="mt-2 font-zh text-sm text-muted-foreground">身份可同时选择；以后增加身份不会移除已有身份。</p>
          <OnboardingForm defaultDisplayName={actor?.displayName} defaultRoles={actor?.roles} intent={intent} />
          <form action={signOutAction} className="mt-5 text-center">
            <button
              type="submit"
              className="rounded-sm font-zh text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              退出
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
