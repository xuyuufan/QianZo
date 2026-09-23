import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { aipmPayloadSchema } from "@/modules/aipm/contract";
import { assertActiveRole, type Actor } from "@/modules/identity/onboarding";
import { projectIdSchema } from "@/modules/projects/validation";
import type { Database } from "@/platform/db/client";
import { aipmMessages, aipmSessions, projects, specVersions } from "@/platform/db/schema";

import {
  safeParseSpecDocument,
  SPEC_SCHEMA_VERSION,
  type SpecDocumentV1,
} from "./document";
import { SpecError } from "./errors";
import { adoptSpecProposalInputSchema, saveSpecVersionInputSchema } from "./validation";

export type Project = typeof projects.$inferSelect;

export type StoredSpecVersion = {
  id: string;
  projectId: string;
  versionNo: number;
  schemaVersion: number;
  /** Raw stored JSONB; `document` is the validated view of it. */
  content: unknown;
  document: SpecDocumentV1 | null;
  createdBy: string;
  sourceMessageId: string | null;
  createdAt: Date;
};

export type ProjectSpecHistory = {
  project: Project;
  current: StoredSpecVersion | null;
  /** Newest first. */
  versions: StoredSpecVersion[];
};

/** Only the query methods both a pool connection and a transaction provide. */
type Executor = Pick<Database, "execute">;

function toStoredSpecVersion(row: typeof specVersions.$inferSelect): StoredSpecVersion {
  return {
    id: row.id,
    projectId: row.projectId,
    versionNo: row.versionNo,
    schemaVersion: row.schemaVersion,
    content: row.content,
    document: safeParseSpecDocument(row.content).data ?? null,
    createdBy: row.createdBy,
    sourceMessageId: row.sourceMessageId,
    createdAt: row.createdAt,
  };
}

type SpecVersionRow = {
  id: string;
  project_id: string;
  version_no: number;
  schema_version: number;
  content: unknown;
  created_by: string;
  source_message_id: string | null;
  created_at: Date;
};

function toStoredFromSqlRow(row: SpecVersionRow): StoredSpecVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    versionNo: row.version_no,
    schemaVersion: row.schema_version,
    content: row.content,
    document: safeParseSpecDocument(row.content).data ?? null,
    createdBy: row.created_by,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at,
  };
}

/**
 * Appends one immutable version. The caller must already hold the project row
 * lock, which is what makes `max(version_no) + 1` safe; the UNIQUE constraint on
 * (project_id, version_no) is the backstop.
 */
async function insertSpecVersion(
  executor: Executor,
  params: {
    projectId: string;
    createdBy: string;
    sourceMessageId: string | null;
    document: SpecDocumentV1;
  },
): Promise<StoredSpecVersion> {
  const [next] = await executor.execute<{ version_no: number }>(sql`
    select coalesce(max(version_no), 0) + 1 as version_no
    from app.spec_versions
    where project_id = ${params.projectId}
  `);

  const inserted = await executor.execute<SpecVersionRow>(sql`
    insert into app.spec_versions
      (id, project_id, version_no, schema_version, content, created_by, source_message_id)
    values (
      ${randomUUID()},
      ${params.projectId},
      ${next.version_no},
      ${SPEC_SCHEMA_VERSION},
      ${JSON.stringify(params.document)}::jsonb,
      ${params.createdBy},
      ${params.sourceMessageId}
    )
    returning id, project_id, version_no, schema_version, content, created_by,
      source_message_id, created_at
  `);

  return toStoredFromSqlRow(inserted[0]);
}

async function moveCurrentPointer(executor: Executor, projectId: string, specVersionId: string) {
  await executor.execute(sql`
    update app.projects
    set current_spec_version_id = ${specVersionId}, version = version + 1, updated_at = now()
    where id = ${projectId}
  `);
}

/**
 * Adopts the proposal held by one stored assistant message. The document is
 * taken from the persisted payload, never from the client, and a candidate is
 * only adoptable while the project still matches the version it was generated
 * from.
 */
export async function adoptSpecProposalWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<StoredSpecVersion> {
  assertActiveRole(actor, "ENTERPRISE");
  const input = adoptSpecProposalInputSchema.parse(rawInput);

  return database.transaction(async (transaction) => {
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, actor.id)))
      .limit(1)
      .for("update");

    if (!project) {
      throw new SpecError("NOT_FOUND", "Project not found.");
    }

    // The source must be an assistant message of this project's own session.
    const [candidate] = await transaction
      .select({ message: aipmMessages })
      .from(aipmMessages)
      .innerJoin(aipmSessions, eq(aipmMessages.sessionId, aipmSessions.id))
      .where(
        and(eq(aipmMessages.id, input.sourceMessageId), eq(aipmSessions.projectId, project.id)),
      )
      .limit(1);

    if (!candidate || candidate.message.role !== "ASSISTANT") {
      throw new SpecError("INVALID_PROPOSAL", "The source message is not a candidate of this project.");
    }

    const payload = aipmPayloadSchema.safeParse(candidate.message.payload).data ?? null;
    const document = payload?.result.specProposal ?? null;
    if (!payload || !document) {
      throw new SpecError("INVALID_PROPOSAL", "The source message holds no usable spec proposal.");
    }

    // Replaying the same adoption returns the version created the first time
    // instead of appending a second one.
    const [existing] = await transaction
      .select()
      .from(specVersions)
      .where(eq(specVersions.sourceMessageId, input.sourceMessageId))
      .limit(1);
    if (existing) {
      return toStoredSpecVersion(existing);
    }

    if (project.version !== input.expectedVersion) {
      throw new SpecError("VERSION_CONFLICT", "The project has changed since it was opened.");
    }
    if (payload.adoptableProjectVersion !== project.version) {
      throw new SpecError(
        "STALE_PROPOSAL",
        "The candidate was generated from an earlier version of the project.",
      );
    }

    const version = await insertSpecVersion(transaction, {
      projectId: project.id,
      createdBy: actor.id,
      sourceMessageId: input.sourceMessageId,
      document,
    });
    await moveCurrentPointer(transaction, project.id, version.id);
    return version;
  });
}

/** Manual review always appends a new version; it never rewrites history. */
export async function saveSpecVersionWithDatabase(
  database: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<StoredSpecVersion> {
  assertActiveRole(actor, "ENTERPRISE");
  const input = saveSpecVersionInputSchema.parse(rawInput);

  return database.transaction(async (transaction) => {
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, actor.id)))
      .limit(1)
      .for("update");

    if (!project) {
      throw new SpecError("NOT_FOUND", "Project not found.");
    }
    if (project.version !== input.expectedVersion) {
      throw new SpecError("VERSION_CONFLICT", "The project has changed since it was opened.");
    }

    const version = await insertSpecVersion(transaction, {
      projectId: project.id,
      createdBy: actor.id,
      // A manual save is not an adoption of an existing candidate.
      sourceMessageId: null,
      document: input.document,
    });
    await moveCurrentPointer(transaction, project.id, version.id);
    return version;
  });
}

/** Private history view; another enterprise or a builder gets "not found". */
export async function listProjectSpecVersionsWithDatabase(
  database: Database,
  actor: Actor,
  projectId: string,
): Promise<ProjectSpecHistory | null> {
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

  const rows = await database
    .select()
    .from(specVersions)
    .where(eq(specVersions.projectId, project.id))
    .orderBy(desc(specVersions.versionNo));

  const versions = rows.map(toStoredSpecVersion);
  return {
    project,
    current:
      versions.find((version) => version.id === project.currentSpecVersionId) ?? null,
    versions,
  };
}
