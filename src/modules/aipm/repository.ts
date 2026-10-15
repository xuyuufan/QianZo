import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import {
  AIPM_CONTRACT_VERSION,
  aipmPayloadSchema,
  aipmLimits,
  type AipmMessagePayload,
  type AipmOperation,
  type AipmRequest,
  type AipmSuccessResponse,
} from "@/modules/aipm/contract";
import { AipmError } from "@/modules/aipm/errors";
import type { InterviewTurnInput } from "@/modules/aipm/validation";
import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import { withProjectLock } from "@/modules/projects/lock";
import { projectIdSchema } from "@/modules/projects/validation";
import { safeParseSpecDocument } from "@/modules/specs/document";
import type { Database } from "@/platform/db/client";
import { aipmMessages, aipmSessions, projects, specVersions } from "@/platform/db/schema";

export type Project = typeof projects.$inferSelect;

/**
 * The stored session cap: the total USER + ASSISTANT rows one interview may
 * hold. It is deliberately not `aipmLimits.messagesPerRequest` (which caps a
 * single request transcript); the two limits share a value of 40 today but are
 * distinct concepts.
 */
export const maxSessionMessages = aipmLimits.sessionMessages;

export type InterviewMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
  payload: AipmMessagePayload | null;
};

export type ProjectInterview = {
  project: Project;
  sessionId: string | null;
  messages: InterviewMessage[];
};

export type PreparedAipmInvocation = {
  sessionId: string;
  request: AipmRequest;
  /** Project.version recorded together with the user message, before the call. */
  baseProjectVersion: number;
  /** Current spec version the request was assembled from, if any. */
  baseSpecVersionId: string | null;
};

export type CompletedAipmInvocation = {
  messageId: string;
  projectVersion: number;
  adoptableProjectVersion: number | null;
  hasProposal: boolean;
};

/**
 * First short transaction: lock the project, record the user message and record
 * the generation baseline. The gateway call happens after this commits, so no
 * database lock is held while waiting for the provider.
 */
export async function beginAipmInvocationWithDatabase(
  database: Database,
  actor: Actor,
  input: InterviewTurnInput,
  invocationId: string,
): Promise<PreparedAipmInvocation> {
  assertActiveRole(actor, "ENTERPRISE");

  return database.transaction((transaction) =>
    withProjectLock(
      transaction,
      { projectId: input.projectId, ownerId: actor.id, expectedVersion: input.expectedVersion },
      {
        notFound: () => new AipmError("NOT_FOUND", "Project not found."),
        // The interview closes with the scope: a locked project accepts no new turns.
        specLocked: () => new AipmError("SPEC_LOCKED", "The reviewed scope is locked."),
        versionConflict: () =>
          new AipmError("VERSION_CONFLICT", "The project has changed since it was opened."),
      },
      async (project) => {
        // One session per project, created on demand; `on conflict` keeps a
        // replay from creating a second interview.
        await transaction.execute(sql`
          insert into app.aipm_sessions (id, project_id)
          values (${randomUUID()}, ${project.id})
          on conflict (project_id) do nothing
        `);

        const [session] = await transaction
          .select({ id: aipmSessions.id })
          .from(aipmSessions)
          .where(eq(aipmSessions.projectId, project.id))
          .limit(1);
        if (!session) {
          throw new Error("The interview session could not be created.");
        }

        const history = await transaction
          .select()
          .from(aipmMessages)
          .where(eq(aipmMessages.sessionId, session.id))
          .orderBy(asc(aipmMessages.sequence));

        // One turn stores two rows (this USER message and the ASSISTANT answer
        // that `complete` will append). Reserving both here keeps a failed answer
        // from leaving a user message that can never be answered: otherwise the
        // session could reach the limit at an odd count and every retry refused.
        //
        // Deliberate trade-off: reserving two slots means a provider failure
        // (which stores only the USER row) makes the session reach the cap one
        // round earlier and refuses further turns. That is intended, not a bug —
        // a slightly shorter session is preferable to a stuck message that can
        // never receive a reply.
        if (history.length + 2 > maxSessionMessages) {
          throw new AipmError(
            "MESSAGE_LIMIT_REACHED",
            "The interview reached the message limit for this session.",
          );
        }

        const previousSequence = history.length === 0 ? 0 : history[history.length - 1].sequence;
        // Column-scoped INSERT keeps the runtime role from writing timestamps.
        await transaction.execute(sql`
          insert into app.aipm_messages (id, session_id, sequence, role, content, payload)
          values (${randomUUID()}, ${session.id}, ${previousSequence + 1}, 'USER', ${input.message}, null)
        `);

        await transaction.execute(sql`
          update app.projects
          set version = version + 1, updated_at = now()
          where id = ${project.id} and owner_id = ${actor.id}
        `);

        // The current reviewed version is the generation baseline. A row that no
        // longer validates is not sent to the provider.
        const [currentSpec] = project.currentSpecVersionId
          ? await transaction
              .select()
              .from(specVersions)
              .where(eq(specVersions.id, project.currentSpecVersionId))
              .limit(1)
          : [];
        const baseDocument = currentSpec
          ? (safeParseSpecDocument(currentSpec.content).data ?? null)
          : null;
        const baseSpec =
          currentSpec && baseDocument ? { versionId: currentSpec.id, document: baseDocument } : null;

        return {
          sessionId: session.id,
          baseProjectVersion: project.version + 1,
          baseSpecVersionId: baseSpec?.versionId ?? null,
          request: {
            contractVersion: AIPM_CONTRACT_VERSION,
            invocationId,
            operation: input.operation,
            project: {
              id: project.id,
              title: project.title,
              originalRequirement: project.originalRequirement,
            },
            sessionId: session.id,
            messages: [
              ...history.map((message) => ({
                role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
                content: message.content,
              })),
              { role: "user" as const, content: input.message },
            ],
            baseSpec,
            ...(input.instruction ? { instruction: input.instruction } : {}),
          },
        };
      },
    ),
  );
}

/**
 * Second short transaction: re-check identity and ownership, append the
 * validated assistant message and only mark the candidate adoptable while the
 * generation baseline still matches the project.
 */
export async function completeAipmInvocationWithDatabase(
  database: Database,
  actor: Actor,
  params: {
    projectId: string;
    sessionId: string;
    operation: AipmOperation;
    baseProjectVersion: number;
    baseSpecVersionId: string | null;
    response: AipmSuccessResponse;
  },
): Promise<CompletedAipmInvocation> {
  assertActiveRole(actor, "ENTERPRISE");

  return database.transaction((transaction) =>
    withProjectLock(
      transaction,
      { projectId: params.projectId, ownerId: actor.id },
      { notFound: () => new AipmError("NOT_FOUND", "Project not found.") },
      async (project) => {
        const [session] = await transaction
          .select({ id: aipmSessions.id })
          .from(aipmSessions)
          .where(and(eq(aipmSessions.id, params.sessionId), eq(aipmSessions.projectId, project.id)))
          .limit(1);
        if (!session) {
          throw new AipmError("NOT_FOUND", "Interview session not found.");
        }

        const [next] = await transaction.execute<{ sequence: number }>(sql`
          select coalesce(max(sequence), 0) + 1 as sequence
          from app.aipm_messages
          where session_id = ${session.id}
        `);
        // No cap check here, deliberately. `begin` admits a round only when the
        // session has room for both rows, and once a USER message is admitted its
        // answer must be storable — refusing it here would strand that message
        // for good. Overlapping turns can therefore push a session a little past
        // the cap; that is the cheaper failure, because the next `begin` refuses
        // while every admitted message still gets its reply. The cap bounds what
        // can be admitted, not what can be answered.

        // A late or concurrent answer keeps its history but is never rebased onto
        // a newer baseline.
        const baselineMatches = project.version === params.baseProjectVersion;
        const nextProjectVersion = project.version + 1;

        const payload: AipmMessagePayload = {
          invocationId: params.response.invocationId,
          contractVersion: params.response.contractVersion,
          operation: params.operation,
          generatedFromProjectVersion: params.baseProjectVersion,
          baseSpecVersionId: params.baseSpecVersionId,
          adoptableProjectVersion: baselineMatches ? nextProjectVersion : null,
          result: params.response.result,
        };

        const messageId = randomUUID();
        await transaction.execute(sql`
          insert into app.aipm_messages (id, session_id, sequence, role, content, payload)
          values (
            ${messageId},
            ${session.id},
            ${next.sequence},
            'ASSISTANT',
            ${params.response.result.assistantMessage},
            ${JSON.stringify(payload)}::jsonb
          )
        `);

        await transaction.execute(sql`
          update app.projects
          set version = version + 1, updated_at = now()
          where id = ${project.id} and owner_id = ${actor.id}
        `);

        return {
          messageId,
          projectVersion: nextProjectVersion,
          adoptableProjectVersion: payload.adoptableProjectVersion,
          hasProposal: Boolean(payload.result.specProposal),
        };
      },
    ),
  );
}

/**
 * Private interview view. Another enterprise, a builder or a missing project all
 * return `null` instead of leaking that the project exists.
 */
export async function getProjectInterviewWithDatabase(
  database: Database,
  actor: Actor,
  projectId: string,
): Promise<ProjectInterview | null> {
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

  const [session] = await database
    .select({ id: aipmSessions.id })
    .from(aipmSessions)
    .where(eq(aipmSessions.projectId, project.id))
    .limit(1);
  if (!session) {
    return { project, sessionId: null, messages: [] };
  }

  const rows = await database
    .select()
    .from(aipmMessages)
    .where(eq(aipmMessages.sessionId, session.id))
    .orderBy(asc(aipmMessages.sequence));

  return {
    project,
    sessionId: session.id,
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role as InterviewMessage["role"],
      content: row.content,
      createdAt: row.createdAt,
      // Payload written by the platform; a row that does not parse is treated as
      // a plain message instead of breaking the page.
      payload: aipmPayloadSchema.safeParse(row.payload).data ?? null,
    })),
  };
}
