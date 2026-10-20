import { and, eq, sql } from "drizzle-orm";

import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import { PaymentError } from "@/modules/payments/errors";
import { enterpriseDeposit } from "@/modules/payments/mock-provider";
import {
  buildRecruitmentSnapshot,
  parseRecruitmentSnapshot,
  stableJson,
} from "@/modules/recruitment/snapshot";
import { safeParseSpecDocument } from "@/modules/specs/document";
import { maskSpecIssues } from "@/modules/specs/mask";
import type { Database } from "@/platform/db/client";
import { payments, projects, specVersions } from "@/platform/db/schema";

import { ProjectError } from "./errors";
import { withProjectLock } from "./lock";
import type { Project } from "./repository";
import { publishProjectInputSchema } from "./validation";

/**
 * One transaction publishes the project: the locked source, the masked preview
 * and a succeeded enterprise deposit are verified, then the whitelist snapshot,
 * the timestamp and `OPEN` are written together. Nothing is left half-published.
 */
export async function publishProjectWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<Project> {
  assertActiveRole(actor, "ENTERPRISE");
  const input = publishProjectInputSchema.parse(rawInput);

  return database.transaction((transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id },
      { notFound: () => new ProjectError("NOT_FOUND", "Project not found.") },
      async (project) => {
        // Repeating the same published intent returns the current result;
        // anything else cannot rewrite the snapshot that is already public.
        // This runs before the locked-scope checks on purpose.
        if (project.publishedAt) {
          const published = parseRecruitmentSnapshot(project.publishedSpecSnapshot);
          const sameResult =
            published !== null &&
            published.lockedSpecVersionId === input.lockedSpecVersionId &&
            published.title === input.maskedTitle &&
            stableJson(published.document) === stableJson(input.maskedDocument);
          if (sameResult) {
            return project;
          }
          throw new ProjectError(
            "PUBLISH_CONFLICT",
            "The published snapshot cannot be rewritten with a different preview.",
          );
        }

        if (!project.lockedSpecVersionId || !project.lockedAt) {
          throw new ProjectError("SPEC_LOCKED", "The reviewed scope must be locked before publishing.");
        }
        if (input.lockedSpecVersionId !== project.lockedSpecVersionId) {
          throw new ProjectError(
            "INVALID_SOURCE",
            "The preview was not derived from the currently locked version.",
          );
        }
        if (project.version !== input.expectedVersion) {
          throw new ProjectError("VERSION_CONFLICT", "The project has changed since it was opened.");
        }
        if (
          project.budgetMinMinor === null ||
          project.budgetMaxMinor === null ||
          !project.currency
        ) {
          throw new ProjectError("INVALID_STAGE", "A complete reference budget is required.");
        }

        const [lockedVersion] = await transaction
          .select()
          .from(specVersions)
          .where(
            and(eq(specVersions.id, project.lockedSpecVersionId), eq(specVersions.projectId, project.id)),
          )
          .limit(1);
        const lockedDocument = lockedVersion
          ? (safeParseSpecDocument(lockedVersion.content).data ?? null)
          : null;
        if (!lockedDocument) {
          throw new ProjectError("INVALID_SOURCE", "The locked version could not be read.");
        }

        // Masking may replace text, never structure, counts or the timeline.
        const maskIssues = maskSpecIssues(lockedDocument, input.maskedDocument);
        if (maskIssues.length > 0) {
          throw new ProjectError("INVALID_PREVIEW", "The masked preview dropped or changed obligations.");
        }

        // Project row first, then the deposit row.
        const [payment] = await transaction
          .select()
          .from(payments)
          .where(
            and(eq(payments.projectId, project.id), eq(payments.purpose, enterpriseDeposit.purpose)),
          )
          .limit(1)
          .for("update");
        // The project already proved ownership, so a missing deposit is a stage
        // problem rather than an authorization one.
        if (!payment) {
          throw new PaymentError("PAYMENT_REQUIRED", "A succeeded enterprise deposit is required.");
        }
        if (payment.payerId !== actor.id) {
          throw new PaymentError("NOT_FOUND", "Payment not found.");
        }
        if (payment.status !== "SUCCEEDED") {
          throw new PaymentError("PAYMENT_REQUIRED", "A succeeded enterprise deposit is required.");
        }

        // The budget is verified above, so the snapshot is built from real values.
        const snapshot = buildRecruitmentSnapshot({
          lockedSpecVersionId: input.lockedSpecVersionId,
          title: input.maskedTitle,
          budgetMinMinor: project.budgetMinMinor,
          budgetMaxMinor: project.budgetMaxMinor,
          currency: project.currency,
          document: input.maskedDocument,
        });

        await transaction.execute(sql`
          update app.projects
          set status = 'OPEN',
            published_spec_snapshot = ${JSON.stringify(snapshot)}::jsonb,
            published_at = now(),
            version = version + 1,
            updated_at = now()
          where id = ${project.id} and owner_id = ${actor.id} and status = 'DRAFT'
        `);

        const [published] = await transaction
          .select()
          .from(projects)
          .where(eq(projects.id, project.id))
          .limit(1);
        if (!published) {
          throw new Error("The published project could not be read back.");
        }
        return published;
      },
    ),
  );
}
