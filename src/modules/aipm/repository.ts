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
import { projectIdSchema } from "@/modules/projects/validation";
import { safeParseSpecDocument } from "@/modules/specs/document";
import type { Database } from "@/platform/db/client";
import { aipmMessages, aipmSessions, projects, specVersions } from "@/platform/db/schema";

export type Project = typeof projects.$inferSelect;

/** The request carries the whole transcript, so this also caps the session. */
export const maxSessionMessages = aipmLimits.messagesPerRequest;

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

  return database.transaction(async (transaction) => {
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, actor.id)))
      .limit(1)
      .for("update");

    if (!project) {
      throw new AipmError("NOT_FOUND", "Project not found.");
    }
    if (project.version !== input.expectedVersion) {
      throw new AipmError("VERSION_CONFLICT", "The project has changed since it was opened.");
    }

    // One session per project, created on demand; `on conflict` keeps a replay
    // from creating a second interview.
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

    if (history.length + 1 > maxSessionMessages) {
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
  });
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

  return database.transaction(async (transaction) => {
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.projectId), eq(projects.ownerId, actor.id)))
      .limit(1)
      .for("update");

    if (!project) {
      throw new AipmError("NOT_FOUND", "Project not found.");
    }

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
    if (next.sequence > maxSessionMessages) {
      throw new AipmError(
        "MESSAGE_LIMIT_REACHED",
        "The interview reached the message limit for this session.",
      );
    }

    // A late or concurrent answer keeps its history but is never rebased onto a
    // newer baseline.
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
  });
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
