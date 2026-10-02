"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Role = "requester" | "builder";

export function HomePage() {
  const router = useRouter();
  const [hoverRole, setHoverRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [transitioning, setTransitioning] = useState<Role | null>(null);
  const activeRole = hoverRole ?? selectedRole;

  // The poster carries the first paint, so the 7.8MB clip is only requested
  // once it can actually be shown. Below `md` the film layer is css-hidden, and
  // `prefers-reduced-motion: reduce` hides it outright, so neither case should
  // autoplay or download the video for a frame the visitor never sees. A
  // compound query reports changes in either part, and the first render (which
  // server and client agree on) has no source yet.
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
    );
    const update = () => setShowVideo(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!showVideo) {
      // Removing <source> alone leaves an already selected resource playing.
      // React has removed the source before this effect, so load() releases it.
      video.pause();
      if (video.currentSrc) video.load();
      return;
    }
    video.style.removeProperty("display");
    const source = video.querySelector("source");
    const hideFailedVideo = () => {
      video.style.display = "none";
    };
    const hideMediaError = () => {
      if (video.error) hideFailedVideo();
    };
    video.addEventListener("error", hideMediaError);
    source?.addEventListener("error", hideFailedVideo);
    // Register failure listeners before selecting the resource again. Resetting
    // a previous selection can queue events that are not errors in this one.
    video.load();
    return () => {
      video.removeEventListener("error", hideMediaError);
      source?.removeEventListener("error", hideFailedVideo);
    };
  }, [showVideo]);

  const chooseRole = (role: Role) => {
    if (transitioning) return;
    setSelectedRole(role);
    setTransitioning(role);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      router.push(`/sign-in?intent=${role}`);
    }, reduceMotion ? 320 : 1300);
  };

  return (
    <main
      className="qianzo-home group/home relative isolate flex min-h-[100svh] overflow-hidden bg-background text-foreground"
      data-active-role={activeRole ?? "none"}
      data-scheme="light"
      data-transition={transitioning ?? undefined}
    >
      <div className="absolute inset-0 -z-30 bg-background" />
      <Image
        src="/assets/qianzo-mechanical-light-poster.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-20 size-full object-cover grayscale"
        width={1920}
        height={1080}
        sizes="100vw"
        priority
        unoptimized
      />
      <video
        ref={videoRef}
        className="qianzo-film absolute inset-0 -z-20 hidden size-full object-cover grayscale md:block"
        autoPlay={showVideo}
        muted
        loop
        playsInline
        preload="metadata"
        poster="/assets/qianzo-mechanical-light-poster.webp"
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = 1.2;
        }}
        aria-hidden="true"
      >
        {showVideo ? (
          <source
            src="/assets/qianzo-mechanical-light.mp4"
            type="video/mp4"
          />
        ) : null}
      </video>
      <div className="qianzo-shade absolute inset-0 -z-10" aria-hidden="true" />
      <div className="qianzo-grain pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7 lg:px-12 lg:pt-9">
        <Link href="/" aria-label="千轴首页" className="flex items-baseline gap-3 text-foreground">
          <span className="font-brand text-sm font-medium uppercase tracking-[0.22em]">QIANZO</span>
          <span className="font-zh text-sm font-light text-foreground/65">千轴</span>
        </Link>
        <span className="hidden items-center gap-2 font-brand text-[10px] uppercase tracking-[0.2em] text-foreground/40 sm:flex">
          <span className="size-1 rounded-full bg-foreground/45" />
          Spec-driven collaboration
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-5 pb-7 pt-24 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12 lg:pt-28">
        <div className="flex flex-1 items-center justify-center pb-10 pt-6 sm:pb-14">
          <div className="qianzo-copy max-w-[850px] text-center">
            <div className="mb-7 flex items-center justify-center gap-3 sm:mb-9" aria-hidden="true">
              <span className="h-px w-10 bg-foreground/20" />
              <span className="size-1 rounded-full bg-requester" />
              <span className="h-px w-16 bg-foreground/20" />
              <span className="size-1 rounded-full bg-builder" />
              <span className="h-px w-10 bg-foreground/20" />
            </div>
            <h1 className="font-zh text-[clamp(2.25rem,5.3vw,5rem)] font-light leading-[1.18] tracking-normal text-foreground">
              从想法到交付，
              <br />
              每一步都有据可依。
            </h1>
            <p className="mx-auto mt-6 max-w-[610px] font-zh text-sm font-light leading-7 tracking-normal text-foreground/62 sm:mt-8 sm:text-base sm:leading-8">
              千轴将需求梳理为清晰的 Spec，
              <span className="hidden sm:inline"><br /></span>
              让需求方与开发者围绕同一套标准协作、开发与验收。
            </p>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 border-y border-foreground/15 sm:grid-cols-2 sm:border-y-0">
          <RoleEntry
            role="requester"
            title="我是需求方"
            description="发布项目、梳理需求"
            activeRole={activeRole}
            selected={selectedRole === "requester"}
            disabled={transitioning !== null}
            onFocus={setHoverRole}
            onChoose={chooseRole}
          />
          <RoleEntry
            role="builder"
            title="我是开发者"
            description="承接项目、完成交付"
            activeRole={activeRole}
            selected={selectedRole === "builder"}
            disabled={transitioning !== null}
            onFocus={setHoverRole}
            onChoose={chooseRole}
          />
        </div>
        <p className="mt-4 min-h-5 text-center font-zh text-xs font-light text-foreground/55" role="status" aria-live="polite">
          {selectedRole
            ? `已选择「${selectedRole === "requester" ? "我是需求方" : "我是开发者"}」· 正在进入登录`
            : ""}
        </p>
      </section>
      {transitioning && (
        <div className="qz-transition fixed inset-0 z-50" data-role={transitioning} aria-hidden="true">
          <div className="qz-t-paper absolute inset-0" />
          <div className="qz-t-grid absolute inset-0" />
          <span className="qz-t-h absolute left-0 right-0 top-1/2 h-px" />
          <span className="qz-t-v absolute bottom-0 left-1/2 top-0 w-px" />
          <span className="qz-t-dot absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </div>
      )}
    </main>
  );
}

function RoleEntry({
  role,
  title,
  description,
  activeRole,
  selected,
  disabled,
  onFocus,
  onChoose,
}: {
  selected: boolean;
  disabled: boolean;
  role: Role;
  title: string;
  description: string;
  activeRole: Role | null;
  onFocus: (role: Role | null) => void;
  onChoose: (role: Role) => void;
}) {
  const isActive = activeRole === role;

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onMouseEnter={() => onFocus(role)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(role)}
      onBlur={() => onFocus(null)}
      onClick={() => onChoose(role)}
      className="role-entry group/role relative h-auto min-h-28 w-full justify-start rounded-none border-0 bg-transparent px-0 py-5 text-left text-foreground shadow-none hover:bg-transparent hover:text-foreground focus-visible:ring-0 active:bg-foreground/[0.04] touch-manipulation sm:min-h-32 sm:border-y sm:border-foreground/15 sm:px-7 lg:min-h-36 lg:px-10"
      data-role={role}
      data-active={isActive ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      aria-label={`${title}：${description}`}
    >
      <span className="flex w-full items-center gap-5">
        <span className="min-w-0 flex-1">
          <span className="role-icon mb-3 block text-foreground/40 sm:mb-4" aria-hidden="true">
            {role === "requester" ? (
              <Building2 className="size-5 sm:size-[22px]" strokeWidth={1.25} />
            ) : (
              <Code2 className="size-5 sm:size-[22px]" strokeWidth={1.25} />
            )}
          </span>
          <span className="role-kicker mb-2 block font-brand text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/35">
            {role === "requester" ? "REQUESTER" : "BUILDER"}
          </span>
          <span className="role-title block font-zh text-xl font-normal tracking-normal sm:text-2xl">
            {title}
          </span>
          <span className="mt-2 block font-zh text-xs font-light tracking-normal text-foreground/48 sm:text-sm">
            {description}
          </span>
          {selected && (
            <span className="role-selected mt-3 inline-flex items-center gap-2 font-brand text-[10px] uppercase tracking-[0.2em]">
              <span className="size-1.5 rounded-full bg-current" />
              Selected · 已选择
            </span>
          )}
        </span>
        <span className="role-rail flex min-w-24 flex-1 items-center sm:min-w-28">
          <span className="h-px flex-1 bg-current opacity-35" />
          <span className="role-node size-2.5 rounded-full border border-current bg-background" />
          <ArrowRight className="role-arrow ml-2 size-4" strokeWidth={1.25} />
        </span>
      </span>
    </Button>
  );
}
