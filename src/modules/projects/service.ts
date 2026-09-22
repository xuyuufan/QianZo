import "server-only";

import { requireRole } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import {
  createProjectWithDatabase,
  getOwnProjectWithDatabase,
  listOwnProjectsWithDatabase,
  updateProjectDraftWithDatabase,
} from "./repository";

export async function listOwnProjects(userId: string) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return listOwnProjectsWithDatabase(getDatabase(), actor);
}

export async function getOwnProject(userId: string, projectId: string) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return getOwnProjectWithDatabase(getDatabase(), actor, projectId);
}

export async function createProject(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return createProjectWithDatabase(getDatabase(), actor, input);
}

export async function updateProjectDraft(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return updateProjectDraftWithDatabase(getDatabase(), actor, input);
}
