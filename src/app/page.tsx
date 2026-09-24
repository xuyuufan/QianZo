import { redirect } from "next/navigation";

import { HomePage } from "@/app/home-page";
import { getActorById } from "@/modules/identity/service";
import { getVerifiedUserId } from "@/platform/auth/server";

export const dynamic = "force-dynamic";

type HomeProps = { searchParams: Promise<{ intent?: string }> };

export default async function Home({ searchParams }: HomeProps) {
  const userId = await getVerifiedUserId();
  if (!userId) return <HomePage />;

  const actor = await getActorById(userId);
  const { intent } = await searchParams;
  const requestedRole = intent === "requester" ? "ENTERPRISE" : intent === "builder" ? "BUILDER" : null;
  if (!actor || actor.status === "DISABLED" || (requestedRole && !actor.roles.includes(requestedRole))) {
    redirect(requestedRole ? `/onboarding?intent=${intent}` : "/onboarding");
  }
  if (requestedRole === "ENTERPRISE") redirect("/enterprise/projects");
  if (requestedRole === "BUILDER") redirect("/projects");
  if (actor.roles.includes("ENTERPRISE")) redirect("/enterprise/projects");
  redirect("/projects");
}
