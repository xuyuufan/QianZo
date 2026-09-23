import "server-only";

import { requireRole } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import {
  adoptSpecProposalWithDatabase,
  listProjectSpecVersionsWithDatabase,
  saveSpecVersionWithDatabase,
} from "./repository";

export async function adoptSpecProposal(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return adoptSpecProposalWithDatabase(getDatabase(), actor, input);
}

export async function saveSpecVersion(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return saveSpecVersionWithDatabase(getDatabase(), actor, input);
}

export async function getProjectSpecs(userId: string, projectId: string) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return listProjectSpecVersionsWithDatabase(getDatabase(), actor, projectId);
}
