import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { assertActiveActor, type Actor } from "@/modules/identity/onboarding";
import { projectIdSchema } from "@/modules/projects/validation";
import type { Database } from "@/platform/db/client";
import { projects } from "@/platform/db/schema";

import {
  parseRecruitmentSnapshot,
  toRecruitmentDetail,
  toRecruitmentSummary,
  type RecruitmentDetail,
  type RecruitmentSummary,
} from "./snapshot";

/**
 * Recruitment reads only ever select the published snapshot and the timestamp
 * that carries it. The private columns (original requirement, owner, budget
 * pointer, payment) are never fetched, so they cannot leak through a DTO.
 */
const recruitmentColumns = {
  id: projects.id,
  publishedAt: projects.publishedAt,
  snapshot: projects.publishedSpecSnapshot,
};

export async function listOpenRecruitmentsWithDatabase(
  database: Database,
  actor: Actor,
): Promise<RecruitmentSummary[]> {
  assertActiveActor(actor);

  const rows = await database
    .select(recruitmentColumns)
    .from(projects)
    .where(eq(projects.status, "OPEN"))
    .orderBy(desc(projects.publishedAt));

  return rows.flatMap((row) => {
    const snapshot = parseRecruitmentSnapshot(row.snapshot);
    // A row that cannot be trusted is skipped instead of breaking the list.
    if (!snapshot || !row.publishedAt) {
      return [];
    }
    return [toRecruitmentSummary(row.id, row.publishedAt, snapshot)];
  });
}

export async function getOpenRecruitmentWithDatabase(
  database: Database,
  actor: Actor,
  projectId: string,
): Promise<RecruitmentDetail | null> {
  assertActiveActor(actor);
  const parsedProjectId = projectIdSchema.parse(projectId);

  const [row] = await database
    .select(recruitmentColumns)
    .from(projects)
    .where(and(eq(projects.id, parsedProjectId), eq(projects.status, "OPEN")))
    .limit(1);
  if (!row || !row.publishedAt) {
    return null;
  }

  const snapshot = parseRecruitmentSnapshot(row.snapshot);
  if (!snapshot) {
    return null;
  }
  return toRecruitmentDetail(row.id, row.publishedAt, snapshot);
}
