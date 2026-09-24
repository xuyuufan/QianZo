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

  return (
    <main className="auth-shell auth-brand-shell">
      <section className="auth-card auth-brand-card" aria-labelledby="sign-in-title">
        <div className="auth-brand-intro">
          <Link className="brand" href="/">QIANZO <span>千轴</span></Link>
          <p className="eyebrow">SECURE ACCESS · {intent === "requester" ? "需求方" : intent === "builder" ? "开发者" : "QIANZO"}</p>
          <h1 id="sign-in-title" className="section-title">欢迎回来，<br />继续你的协作。</h1>
          <p className="lede">登录后，围绕清晰的 Spec 推进项目。</p>
        </div>
        <SignInForm intent={intent} />
      </section>
    </main>
  );
}
