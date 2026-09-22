import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/platform/db/client";
import { userRoles, users, type UserRole, type UserStatus } from "@/platform/db/schema";

export const onboardingInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    roles: z
      .array(z.enum(["ENTERPRISE", "BUILDER"]))
      .min(1)
      .max(2)
      .refine((roles) => new Set(roles).size === roles.length, "Roles must be unique."),
  })
  .strict();

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

export type Actor = {
  id: string;
  displayName: string;
  status: UserStatus;
  roles: UserRole[];
};

export class IdentityError extends Error {
  constructor(
    public readonly code: "ACTOR_DISABLED" | "ONBOARDING_REQUIRED" | "ROLE_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

export async function getActorByIdWithDatabase(
  database: Database,
  userId: string,
): Promise<Actor | null> {
  const [profile] = await database
    .select({ id: users.id, displayName: users.displayName, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!profile) {
    return null;
  }

  const roleRows = await database
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(userRoles.role));

  return {
    id: profile.id,
    displayName: profile.displayName,
    status: profile.status as UserStatus,
    roles: roleRows.map((row) => row.role as UserRole),
  };
}

export async function completeOnboardingWithDatabase(
  database: Database,
  userId: string,
  rawInput: unknown,
): Promise<Actor> {
  const input = onboardingInputSchema.parse(rawInput);

  await database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values({ id: userId, displayName: input.displayName })
      .onConflictDoUpdate({
        target: users.id,
        set: { displayName: input.displayName, updatedAt: new Date() },
        where: eq(users.status, "ACTIVE"),
      });

    const [profile] = await transaction
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!profile || profile.status === "DISABLED") {
      throw new IdentityError("ACTOR_DISABLED", "This account is disabled.");
    }

    await transaction
      .insert(userRoles)
      .values(input.roles.map((role) => ({ userId, role })))
      .onConflictDoNothing();
  });

  const actor = await getActorByIdWithDatabase(database, userId);
  if (!actor) {
    throw new IdentityError("ONBOARDING_REQUIRED", "Onboarding did not create an actor.");
  }
  return actor;
}
