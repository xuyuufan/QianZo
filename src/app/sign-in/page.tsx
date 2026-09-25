import { redirect } from "next/navigation";
import Link from "next/link";

import { getVerifiedUserId } from "@/platform/auth/server";

import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const { intent: rawIntent } = await searchParams;
  const intent = rawIntent === "requester" || rawIntent === "builder" ? rawIntent : undefined;
  if (await getVerifiedUserId()) {
    redirect(intent ? `/?intent=${intent}` : "/");
  }

  const role = intent === "builder" ? "builder" : "requester";
  const copy = role === "requester"
    ? { label: "Requester", title: "开始你的项目", subtitle: "登录后，继续梳理你的需求", returnPrompt: "不是需求方？" }
    : { label: "Builder", title: "开始承接项目", subtitle: "登录后，进入项目大厅", returnPrompt: "不是开发者？" };

  return (
    <div className="qz-paper grid min-h-[100svh] place-items-center px-5 py-12">
      <div className="qz-rise w-full max-w-sm">
        <Link
          href="/"
          className="rounded-sm font-brand text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← QIANZO 千轴
        </Link>
        <main className="mt-10 rounded-[10px] border border-border bg-card p-7 sm:p-8" aria-labelledby="sign-in-title">
          <div className="mb-6 flex items-center gap-2 font-brand text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${role === "requester" ? "bg-requester" : "bg-builder"}`} />
            {copy.label}
          </div>
          <h1 id="sign-in-title" className="font-zh text-2xl font-normal">{copy.title}</h1>
          <p className="mt-2 font-zh text-sm text-muted-foreground">{copy.subtitle}</p>
          <SignInForm intent={intent} />
        </main>
        <p className="mt-6 text-center font-zh text-xs text-muted-foreground">
          {copy.returnPrompt} <Link href="/" className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">返回首页重新选择</Link>
        </p>
      </div>
    </div>
  );
}
