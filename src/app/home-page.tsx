"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowRight, Building2, Code2 } from "lucide-react";

type Role = "requester" | "builder";

export function HomePage() {
  const [activeRole, setActiveRole] = useState<Role | null>(null);

  return (
    <main className="qianzo-home" data-active-role={activeRole ?? "none"}>
      <div className="home-mechanical" aria-hidden="true">
        <div className="home-orbit home-orbit-one" />
        <div className="home-orbit home-orbit-two" />
        <div className="home-orbit home-orbit-three" />
        <div className="home-axis"><i /><i /><i /></div>
      </div>
      <div className="home-grain" aria-hidden="true" />
      <header className="home-header">
        <Link href="/" className="home-brand" aria-label="千轴首页">
          <span>QIANZO</span><span>千轴</span>
        </Link>
        <span className="home-caption"><i /> SPEC-DRIVEN COLLABORATION</span>
      </header>

      <section className="home-content">
        <div className="home-intro">
          <div className="home-rule" aria-hidden="true"><i /><b /><i /><b /><i /></div>
          <p className="home-kicker">从想法，到清晰可交付的项目</p>
          <h1>从想法到交付，<br />每一步都有据可依。</h1>
          <p className="home-description">
            千轴将需求梳理为清晰的 Spec，<br className="desktop-break" />
            让需求方与开发者围绕同一套标准协作、开发与验收。
          </p>
        </div>

        <div className="home-roles">
          <RoleCard
            role="requester"
            active={activeRole === "requester"}
            onFocus={setActiveRole}
            icon={<Building2 aria-hidden="true" />}
            title="我是需求方"
            subtitle="发布项目 · 梳理需求 · 明确验收"
            detail="把想法变成可评估、可协作的项目 Spec。"
          />
          <RoleCard
            role="builder"
            active={activeRole === "builder"}
            onFocus={setActiveRole}
            icon={<Code2 aria-hidden="true" />}
            title="我是开发者"
            subtitle="浏览项目 · 理解范围 · 准备交付"
            detail="在清楚的目标、里程碑与验收标准中协作。"
          />
        </div>
        <p className="home-footnote">让每一次协作，都从共同理解开始。</p>
      </section>

      <footer className="home-footer">
        <span>清楚的需求 · 可验证的交付</span>
        <ArrowDownRight aria-hidden="true" />
        <span>QIANZO · 2026</span>
      </footer>
    </main>
  );
}

function RoleCard({
  role,
  active,
  onFocus,
  icon,
  title,
  subtitle,
  detail,
}: {
  role: Role;
  active: boolean;
  onFocus: (role: Role | null) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  detail: string;
}) {
  const intent = role === "requester" ? "requester" : "builder";
  return (
    <Link
      href={`/sign-in?intent=${intent}`}
      className="home-role"
      data-role={role}
      data-active={active}
      onMouseEnter={() => onFocus(role)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(role)}
      onBlur={() => onFocus(null)}
    >
      <span className="home-role-icon">{icon}</span>
      <span className="home-role-copy">
        <span className="home-role-overline">{role === "requester" ? "REQUEST A PROJECT" : "BUILD A PROJECT"}</span>
        <strong>{title}</strong>
        <span className="home-role-subtitle">{subtitle}</span>
        <span className="home-role-detail">{detail}</span>
      </span>
      <ArrowRight className="home-role-arrow" aria-hidden="true" />
      <span className="home-role-index">0{role === "requester" ? "1" : "2"}</span>
    </Link>
  );
}
