import "server-only";

import { getDatabase } from "@/platform/db/client";

import {
  completeOnboardingWithDatabase,
  getActorByIdWithDatabase,
  IdentityError,
  type Actor,
} from "./onboarding";

export async function getActorById(userId: string): Promise<Actor | null> {
  return getActorByIdWithDatabase(getDatabase(), userId);
}

export async function requireActor(userId: string): Promise<Actor> {
  const actor = await getActorById(userId);
  if (!actor) {
    throw new IdentityError("ONBOARDING_REQUIRED", "Complete onboarding first.");
  }
  if (actor.status === "DISABLED") {
    throw new IdentityError("ACTOR_DISABLED", "This account is disabled.");
  }
  return actor;
}

export async function requireRole(userId: string, role: "ENTERPRISE" | "BUILDER") {
  const actor = await requireActor(userId);
  if (!actor.roles.includes(role)) {
    throw new IdentityError("ROLE_REQUIRED", `The ${role} role is required.`);
  }
  return actor;
}

export async function completeOnboarding(userId: string, input: unknown) {
  return completeOnboardingWithDatabase(getDatabase(), userId, input);
}
