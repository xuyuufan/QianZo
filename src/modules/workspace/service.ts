import "server-only";

import { requireActor } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import { getWorkspaceWithDatabase } from "./repository";

export async function getWorkspace(userId: string, projectId: string) {
  const actor = await requireActor(userId);
  return getWorkspaceWithDatabase(getDatabase(), actor, projectId);
}
