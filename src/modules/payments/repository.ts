import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import { withProjectLock } from "@/modules/projects/lock";
import { projectIdSchema } from "@/modules/projects/validation";
import type { Database } from "@/platform/db/client";
import { applications, payments, projects, type PaymentStatus } from "@/platform/db/schema";

import { PaymentError } from "./errors";
import { builderDeposit, enterpriseDeposit } from "./mock-provider";
import type { PaymentProvider } from "./provider";
import type { BuilderDepositDTO, BuilderDepositPaymentDTO } from "./dto";
import {
  createBuilderDepositInputSchema,
  createEnterpriseDepositInputSchema,
  simulateBuilderDepositSuccessInputSchema,
  simulatePaymentSuccessInputSchema,
} from "./validation";
import { parseRecruitmentSnapshot } from "@/modules/recruitment/snapshot";

export type Project = typeof projects.$inferSelect;
export type Payment = typeof payments.$inferSelect;

export type ProjectPayment = {
  project: Project;
  payment: Payment | null;
};

type BuilderProjectContext = {
  project: Project;
  application: typeof applications.$inferSelect;
};

function toBuilderDepositPaymentDTO(payment: Payment): BuilderDepositPaymentDTO {
  if (
    payment.purpose !== builderDeposit.purpose ||
    payment.amountMinor !== builderDeposit.amountMinor ||
    payment.currency !== builderDeposit.currency ||
    (payment.status !== "PENDING" && payment.status !== "SUCCEEDED")
  ) {
    throw new Error("The Builder deposit does not match the fixed Mock payment.");
  }
  return {
    id: payment.id,
    status: payment.status as PaymentStatus,
    amountMinor: builderDeposit.amountMinor,
    currency: builderDeposit.currency,
  };
}

async function lockSelectedBuilderContext(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  projectId: string,
  actor: Actor,
): Promise<BuilderProjectContext> {
  const [project] = await transaction
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .for("update");
  if (!project?.selectedApplicationId) {
    throw new PaymentError("NOT_FOUND", "Project not found.");
  }

  // Keep the lock order stable for all Builder start operations: Project,
  // selected Application, then Payment.
  const [application] = await transaction
    .select()
    .from(applications)
    .where(and(eq(applications.projectId, project.id), eq(applications.id, project.selectedApplicationId)))
    .limit(1)
    .for("update");
  if (
    !application ||
    application.builderId !== actor.id ||
    application.specVersionId !== project.lockedSpecVersionId
  ) {
    throw new PaymentError("NOT_FOUND", "Project not found.");
  }

  const awaiting = project.status === "AWAITING_BUILDER" && application.status === "SELECTED";
  const started =
    (project.status === "IN_PROGRESS" ||
      project.status === "FINAL_REVIEW" ||
      project.status === "COMPLETED") &&
    application.status === "ENGAGED";
  if ((!awaiting && !started) || (awaiting && project.startedAt) || (started && !project.startedAt)) {
    throw new PaymentError("INVALID_STAGE", "The project is not in a Builder deposit stage.");
  }
  return { project, application };
}

async function assertEnterpriseDepositSucceeded(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  project: Project,
) {
  const [enterprisePayment] = await transaction
    .select({ payerId: payments.payerId, status: payments.status, purpose: payments.purpose })
    .from(payments)
    .where(and(eq(payments.projectId, project.id), eq(payments.purpose, enterpriseDeposit.purpose)))
    .limit(1);
  if (
    !enterprisePayment ||
    enterprisePayment.payerId !== project.ownerId ||
    enterprisePayment.status !== "SUCCEEDED"
  ) {
    throw new PaymentError("PAYMENT_REQUIRED", "The enterprise deposit must succeed first.");
  }
}

function getStartedSnapshot(context: BuilderProjectContext) {
  const { project, application } = context;
  if (!project.lockedSpecVersionId || application.specVersionId !== project.lockedSpecVersionId) {
    throw new PaymentError("INVALID_STAGE", "The selected application is not bound to the locked Spec.");
  }
  const snapshot = parseRecruitmentSnapshot(project.publishedSpecSnapshot);
  if (!snapshot || snapshot.lockedSpecVersionId !== project.lockedSpecVersionId) {
    throw new PaymentError("INVALID_STAGE", "The published project snapshot is unavailable.");
  }
  return snapshot;
}

/**
 * Creates or returns the fixed Builder Mock deposit for the current selected
 * application. The provider call is deliberately outside database locks.
 */
export async function createBuilderDepositWithDatabase(
  database: Database,
  actor: Actor,
  provider: PaymentProvider,
  rawInput: unknown,
): Promise<BuilderDepositPaymentDTO> {
  assertActiveRole(actor, "BUILDER");
  const input = createBuilderDepositInputSchema.parse(rawInput);

  const existing = await database.transaction(async (transaction) => {
    const context = await lockSelectedBuilderContext(transaction, input.projectId, actor);
    const [payment] = await transaction
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.projectId, context.project.id),
          eq(payments.applicationId, context.application.id),
          eq(payments.purpose, builderDeposit.purpose),
        ),
      )
      .limit(1)
      .for("update");
    if (payment) {
      if (payment.payerId !== actor.id) {
        throw new PaymentError("NOT_FOUND", "Payment not found.");
      }
      return payment;
    }

    if (context.project.status !== "AWAITING_BUILDER") {
      throw new PaymentError("INVALID_STAGE", "The project is not waiting for a Builder deposit.");
    }
    await assertEnterpriseDepositSucceeded(transaction, context.project);
    return null;
  });
  if (existing) return toBuilderDepositPaymentDTO(existing);

  const paymentId = randomUUID();
  await provider.createPayment({
    paymentId,
    projectId: input.projectId,
    payerId: actor.id,
    purpose: builderDeposit.purpose,
    amountMinor: builderDeposit.amountMinor,
    currency: builderDeposit.currency,
  });

  const payment = await database.transaction(async (transaction) => {
    const context = await lockSelectedBuilderContext(transaction, input.projectId, actor);
    const [current] = await transaction
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.projectId, context.project.id),
          eq(payments.applicationId, context.application.id),
          eq(payments.purpose, builderDeposit.purpose),
        ),
      )
      .limit(1)
      .for("update");
    if (current) {
      if (current.payerId !== actor.id) throw new PaymentError("NOT_FOUND", "Payment not found.");
      return current;
    }
    if (context.project.status !== "AWAITING_BUILDER") {
      throw new PaymentError("INVALID_STAGE", "The project is not waiting for a Builder deposit.");
    }
    await assertEnterpriseDepositSucceeded(transaction, context.project);

    await transaction.execute(sql`
      insert into app.payments
        (id, project_id, application_id, payer_id, purpose, amount_minor, currency)
      values (
        ${paymentId},
        ${context.project.id},
        ${context.application.id},
        ${actor.id},
        ${builderDeposit.purpose},
        ${builderDeposit.amountMinor},
        ${builderDeposit.currency}
      )
      on conflict (application_id) where purpose = 'BUILDER_DEPOSIT' do nothing
    `);

    const [inserted] = await transaction
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.applicationId, context.application.id),
          eq(payments.purpose, builderDeposit.purpose),
        ),
      )
      .limit(1)
      .for("update");
    if (!inserted || inserted.payerId !== actor.id) {
      throw new Error("The Builder deposit could not be recorded.");
    }
    return inserted;
  });
  return toBuilderDepositPaymentDTO(payment);
}

/**
 * Simulates Builder payment and atomically starts the project. A repeated
 * success returns the same safe payment DTO without touching any timestamps.
 */
export async function simulateBuilderDepositSuccessWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<BuilderDepositPaymentDTO> {
  assertActiveRole(actor, "BUILDER");
  const input = simulateBuilderDepositSuccessInputSchema.parse(rawInput);

  return database.transaction(async (transaction) => {
    const context = await lockSelectedBuilderContext(transaction, input.projectId, actor);
    const [payment] = await transaction
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, input.paymentId),
          eq(payments.projectId, context.project.id),
          eq(payments.applicationId, context.application.id),
          eq(payments.payerId, actor.id),
          eq(payments.purpose, builderDeposit.purpose),
        ),
      )
      .limit(1)
      .for("update");
    if (!payment) {
      throw new PaymentError("NOT_FOUND", "Payment not found.");
    }

    if (payment.status === "SUCCEEDED") {
      if (
        (context.project.status === "IN_PROGRESS" ||
          context.project.status === "FINAL_REVIEW" ||
          context.project.status === "COMPLETED") &&
        context.project.startedAt &&
        context.application.status === "ENGAGED"
      ) {
        return toBuilderDepositPaymentDTO(payment);
      }
      throw new PaymentError("INVALID_STAGE", "The payment and project state do not agree.");
    }
    if (
      payment.status !== "PENDING" ||
      context.project.status !== "AWAITING_BUILDER" ||
      context.application.status !== "SELECTED"
    ) {
      throw new PaymentError("INVALID_STAGE", "The project is not waiting for a Builder deposit.");
    }

    await assertEnterpriseDepositSucceeded(transaction, context.project);
    const snapshot = getStartedSnapshot(context);

    await transaction.execute(sql`
      update app.payments
      set status = 'SUCCEEDED', succeeded_at = now(), updated_at = now()
      where id = ${payment.id} and status = 'PENDING'
    `);
    await transaction.execute(sql`
      update app.applications
      set status = 'ENGAGED', updated_at = now()
      where id = ${context.application.id} and project_id = ${context.project.id} and status = 'SELECTED'
    `);
    await transaction.execute(sql`
      update app.applications
      set status = 'REJECTED', updated_at = now()
      where project_id = ${context.project.id}
        and id <> ${context.application.id}
        and status = 'SUBMITTED'
    `);
    const started = await transaction.execute<{ started_at: Date }>(sql`
      update app.projects
      set status = 'IN_PROGRESS', started_at = now(), version = version + 1, updated_at = now()
      where id = ${context.project.id}
        and status = 'AWAITING_BUILDER'
        and started_at is null
      returning started_at
    `);
    if (!started[0]?.started_at) {
      throw new PaymentError("INVALID_STAGE", "The project could not be started.");
    }

    const deliverablesById = new Map(snapshot.document.deliverables.map((item) => [item.id, item]));
    for (const [index, specMilestone] of snapshot.document.milestones.entries()) {
      const deliverables = specMilestone.deliverableIds.map((id) => {
        const item = deliverablesById.get(id);
        if (!item) throw new PaymentError("INVALID_STAGE", "The published milestone is invalid.");
        return item;
      });
      await transaction.execute(sql`
        insert into app.milestones (
          id, project_id, spec_version_id, spec_milestone_id, position,
          title, description, due_after_days, deliverable_ids, deliverables,
          acceptance_criteria, status, deadline
        )
        select
          ${randomUUID()}, ${context.project.id}, ${context.project.lockedSpecVersionId},
          ${specMilestone.id}, ${index + 1}, ${specMilestone.title}, ${specMilestone.description},
          ${specMilestone.dueAfterDays}, ${JSON.stringify(specMilestone.deliverableIds)}::jsonb,
          ${JSON.stringify(deliverables)}::jsonb, ${JSON.stringify(specMilestone.acceptanceCriteria)}::jsonb,
          ${index === 0 ? "IN_PROGRESS" : "PENDING"},
          to_timestamp(extract(epoch from started_at) + ${specMilestone.dueAfterDays} * 86400)
        from app.projects
        where id = ${context.project.id} and status = 'IN_PROGRESS'
      `);
    }

    return toBuilderDepositPaymentDTO({ ...payment, status: "SUCCEEDED" });
  });
}

/** Safe selected-Builder-only read for the Mock deposit screen. */
export async function getBuilderDepositWithDatabase(
  database: Database,
  actor: Actor,
  projectId: string,
): Promise<BuilderDepositDTO | null> {
  assertActiveRole(actor, "BUILDER");
  const parsedProjectId = projectIdSchema.parse(projectId);
  const [project] = await database
    .select({
      id: projects.id,
      status: projects.status,
      selectedApplicationId: projects.selectedApplicationId,
      startedAt: projects.startedAt,
    })
    .from(projects)
    .where(eq(projects.id, parsedProjectId))
    .limit(1);
  if (!project?.selectedApplicationId) return null;

  const [application] = await database
    .select({ id: applications.id, builderId: applications.builderId, status: applications.status })
    .from(applications)
    .where(and(eq(applications.projectId, project.id), eq(applications.id, project.selectedApplicationId)))
    .limit(1);
  if (
    !application ||
    application.builderId !== actor.id ||
    !(
      (project.status === "AWAITING_BUILDER" && application.status === "SELECTED" && !project.startedAt) ||
      ((project.status === "IN_PROGRESS" ||
        project.status === "FINAL_REVIEW" ||
        project.status === "COMPLETED") &&
        application.status === "ENGAGED" &&
        project.startedAt)
    )
  ) {
    return null;
  }

  const [payment] = await database
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.projectId, project.id),
        eq(payments.applicationId, application.id),
        eq(payments.purpose, builderDeposit.purpose),
      ),
    )
    .limit(1);
  if (payment && payment.payerId !== actor.id) return null;
  if (
    (project.status === "IN_PROGRESS" || project.status === "FINAL_REVIEW" || project.status === "COMPLETED") &&
    (!payment || payment.status !== "SUCCEEDED")
  ) {
    throw new PaymentError("INVALID_STAGE", "The started project is missing its successful deposit.");
  }

  return {
    projectId: project.id,
    applicationId: application.id,
    payment: payment ? toBuilderDepositPaymentDTO(payment) : null,
  };
}

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
          on conflict (project_id) where purpose = 'ENTERPRISE_DEPOSIT' do nothing
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
      .where(and(eq(payments.id, input.paymentId), eq(payments.projectId, input.projectId)))
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
