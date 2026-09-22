import { redirect } from "next/navigation";

import { getVerifiedUserId } from "@/platform/auth/server";

import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getVerifiedUserId()) {
    redirect("/");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div>
          <p className="eyebrow">Qianzo</p>
          <h1 id="sign-in-title" className="section-title">登录</h1>
          <p className="lede">使用本地演示账号继续。</p>
        </div>
        <SignInForm />
      </section>
    </main>
  );
}
