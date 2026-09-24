import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import { withProjectLock } from "@/modules/projects/lock";
import { projectIdSchema } from "@/modules/projects/validation";
import type { Database } from "@/platform/db/client";
import { payments, projects } from "@/platform/db/schema";

import { PaymentError } from "./errors";
import { enterpriseDeposit } from "./mock-provider";
import type { PaymentProvider } from "./provider";
import {
  createEnterpriseDepositInputSchema,
  simulatePaymentSuccessInputSchema,
} from "./validation";

export type Project = typeof projects.$inferSelect;
export type Payment = typeof payments.$inferSelect;

export type ProjectPayment = {
  project: Project;
  payment: Payment | null;
};

/**
 * Creates the single enterprise deposit for a project. The amount, currency,
 * purpose and payer are decided by the platform; a repeated call returns the
 * payment created the first time instead of opening a second order.
 */
export async function createEnterpriseDepositWithDatabase(
  database: Database,
  actor: Actor,
  provider: PaymentProvider,
  rawInput: unknown,
): Promise<Payment> {
  assertActiveRole(actor, "ENTERPRISE");
  const input = createEnterpriseDepositInputSchema.parse(rawInput);

  // First pass: ownership, existing payment and the preconditions for opening a
  // new one, so a replay never reaches the provider.
  const existing = await database.transaction(async (transaction) => {
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, actor.id)))
      .limit(1);
    if (!project) {
      throw new PaymentError("NOT_FOUND", "Project not found.");
    }

    const [payment] = await transaction
      .select()
      .from(payments)
      .where(
        and(eq(payments.projectId, project.id), eq(payments.purpose, enterpriseDeposit.purpose)),
      )
      .limit(1);
    if (payment) {
      return payment;
    }

    assertDepositPreconditions(project);
    return null;
  });

  if (existing) {
    return existing;
  }

  // The provider call sits between two short transactions: no transaction is
  // held while the provider is contacted.
  const paymentId = randomUUID();
  await provider.createPayment({
    paymentId,
    projectId: input.projectId,
    payerId: actor.id,
    purpose: enterpriseDeposit.purpose,
    amountMinor: enterpriseDeposit.amountMinor,
    currency: enterpriseDeposit.currency,
  });

  return database.transaction((transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id },
      { notFound: () => new PaymentError("NOT_FOUND", "Project not found.") },
      async (project) => {
        // A concurrent create may have won the unique constraint while the
        // provider was being called; that payment is the one this project has.
        const [current] = await transaction
          .select()
          .from(payments)
          .where(
            and(eq(payments.projectId, project.id), eq(payments.purpose, enterpriseDeposit.purpose)),
          )
          .limit(1);
        if (current) {
          return current;
        }

        assertDepositPreconditions(project);

        // Column-scoped INSERT keeps the runtime role from choosing status,
        // timestamps or a different amount.
        await transaction.execute(sql`
          insert into app.payments (id, project_id, payer_id, purpose, amount_minor, currency)
          values (
            ${paymentId},
            ${project.id},
            ${actor.id},
            ${enterpriseDeposit.purpose},
            ${enterpriseDeposit.amountMinor},
            ${enterpriseDeposit.currency}
          )
          on conflict (project_id, purpose) do nothing
        `);

        const [inserted] = await transaction
          .select()
          .from(payments)
          .where(
            and(eq(payments.projectId, project.id), eq(payments.purpose, enterpriseDeposit.purpose)),
          )
          .limit(1);
        if (!inserted) {
          throw new Error("The enterprise deposit could not be recorded.");
        }
        return inserted;
      },
    ),
  );
}

/**
 * Mock-only success simulation. The first call moves PENDING → SUCCEEDED and
 * records the time; later calls return the same result without touching the
 * timestamps or the project version, including after the project is published.
 */
export async function simulatePaymentSuccessWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<Payment> {
  assertActiveRole(actor, "ENTERPRISE");
  const input = simulatePaymentSuccessInputSchema.parse(rawInput);

  return database.transaction(async (transaction) => {
    const [found] = await transaction
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .limit(1);
    if (!found) {
      throw new PaymentError("NOT_FOUND", "Payment not found.");
    }

    // The project lock always comes first, then the payment row.
    return withProjectLock(
      transaction,
      { projectId: found.projectId, ownerId: actor.id },
      { notFound: () => new PaymentError("NOT_FOUND", "Payment not found.") },
      async (project) => {
        const [payment] = await transaction
          .select()
          .from(payments)
          .where(eq(payments.id, input.paymentId))
          .limit(1)
          .for("update");
        if (
          !payment ||
          payment.payerId !== actor.id ||
          payment.purpose !== enterpriseDeposit.purpose
        ) {
          throw new PaymentError("NOT_FOUND", "Payment not found.");
        }

        if (payment.status === "SUCCEEDED") {
          return payment;
        }

        assertDepositPreconditions(project);

        await transaction.execute(sql`
          update app.payments
          set status = 'SUCCEEDED', succeeded_at = now(), updated_at = now()
          where id = ${payment.id} and status = 'PENDING'
        `);
        // A successful deposit is a project change: the version token moves on.
        await transaction.execute(sql`
          update app.projects
          set version = version + 1, updated_at = now()
          where id = ${project.id} and owner_id = ${actor.id}
        `);

        const [updated] = await transaction
          .select()
          .from(payments)
          .where(eq(payments.id, payment.id))
          .limit(1);
        if (!updated) {
          throw new Error("The simulated payment could not be read back.");
        }
        return updated;
      },
    );
  });
}

/** Private view of the project and its deposit; `null` means "not yours". */
export async function getProjectPaymentWithDatabase(
  database: Database,
  actor: Actor,
  projectId: string,
): Promise<ProjectPayment | null> {
  assertActiveRole(actor, "ENTERPRISE");
  const parsedProjectId = projectIdSchema.parse(projectId);

  const [project] = await database
    .select()
    .from(projects)
    .where(and(eq(projects.id, parsedProjectId), eq(projects.ownerId, actor.id)))
    .limit(1);
  if (!project) {
    return null;
  }

  const [payment] = await database
    .select()
    .from(payments)
    .where(
      and(eq(payments.projectId, project.id), eq(payments.purpose, enterpriseDeposit.purpose)),
    )
    .limit(1);

  return { project, payment: payment ?? null };
}

/** The deposit only exists for a locked scope that is still a draft. */
function assertDepositPreconditions(project: Project) {
  if (!project.lockedSpecVersionId) {
    throw new PaymentError("SPEC_LOCKED", "The reviewed scope must be locked first.");
  }
  if (project.status !== "DRAFT") {
    throw new PaymentError("INVALID_STAGE", "The project is past the deposit stage.");
  }
}
