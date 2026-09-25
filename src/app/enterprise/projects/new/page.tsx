import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { getActorById } from "@/modules/identity/service";
import { getVerifiedUserId } from "@/platform/auth/server";

import { ProjectHeader } from "../project-header";
import { CreateProjectForm } from "./create-project-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/sign-in");
  const actor = await getActorById(userId);
  if (!actor) redirect("/onboarding");
  if (actor.status !== "ACTIVE") redirect("/onboarding");
  if (!actor.roles.includes("ENTERPRISE")) redirect("/");

  return (
    <div className="qz-paper min-h-[100svh]">
      <ProjectHeader fullBleed />
      <main className="qz-rise mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <CreateProjectForm projectId={randomUUID()} />
      </main>
    </div>
  );
}
