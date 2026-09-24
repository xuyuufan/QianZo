import { asc, eq, sql } from "drizzle-orm";
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

/**
 * Shared guard for service boundaries: an actor must be ACTIVE and hold the
 * expected role before any resource is read or written.
 */
export function assertActiveRole(actor: Actor, role: UserRole) {
  if (actor.status !== "ACTIVE") {
    throw new IdentityError("ACTOR_DISABLED", "This account is disabled.");
  }
  if (!actor.roles.includes(role)) {
    throw new IdentityError("ROLE_REQUIRED", `The ${role} role is required.`);
  }
}

/**
 * For shared views that any active platform user may read, regardless of role.
 * An actor row only exists after onboarding.
 */
export function assertActiveActor(actor: Actor) {
  if (actor.status !== "ACTIVE") {
    throw new IdentityError("ACTOR_DISABLED", "This account is disabled.");
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
    // Column-scoped INSERT keeps the runtime role from setting status or
    // timestamps; Drizzle would list every table column here.
    await transaction.execute(sql`
      insert into app.users (id, display_name)
      values (${userId}, ${input.displayName})
      on conflict (id) do update
        set display_name = excluded.display_name, updated_at = now()
        where app.users.status = 'ACTIVE'
    `);

    const [profile] = await transaction
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!profile || profile.status === "DISABLED") {
      throw new IdentityError("ACTOR_DISABLED", "This account is disabled.");
    }

    await transaction.execute(sql`
      insert into app.user_roles (user_id, role)
      values ${sql.join(
        input.roles.map((role) => sql`(${userId}, ${role})`),
        sql`, `,
      )}
      on conflict do nothing
    `);
  });

  const actor = await getActorByIdWithDatabase(database, userId);
  if (!actor) {
    throw new IdentityError("ONBOARDING_REQUIRED", "Onboarding did not create an actor.");
  }
  return actor;
}
