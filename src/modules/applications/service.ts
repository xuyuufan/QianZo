import "server-only";

import { requireRole } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import {
  applyToProjectWithDatabase,
  getOwnApplicationForProjectWithDatabase,
  listOwnApplicationsWithDatabase,
  listProjectApplicationsWithDatabase,
  selectApplicationWithDatabase,
} from "./repository";

export async function applyToProject(userId: string, input: unknown) {
  const actor = await requireRole(userId, "BUILDER");
  return applyToProjectWithDatabase(getDatabase(), actor, input);
}

export async function listOwnApplications(userId: string) {
  const actor = await requireRole(userId, "BUILDER");
  return listOwnApplicationsWithDatabase(getDatabase(), actor);
}

export async function getOwnApplicationForProject(userId: string, projectId: string) {
  const actor = await requireRole(userId, "BUILDER");
  return getOwnApplicationForProjectWithDatabase(getDatabase(), actor, projectId);
}

export async function listProjectApplications(userId: string, projectId: string) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return listProjectApplicationsWithDatabase(getDatabase(), actor, projectId);
}

export async function selectApplication(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return selectApplicationWithDatabase(getDatabase(), actor, input);
}
