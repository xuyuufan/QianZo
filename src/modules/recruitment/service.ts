import "server-only";

import { requireActor } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import { getOpenRecruitmentWithDatabase, listOpenRecruitmentsWithDatabase } from "./repository";

export async function listOpenRecruitments(userId: string) {
  const actor = await requireActor(userId);
  return listOpenRecruitmentsWithDatabase(getDatabase(), actor);
}

export async function getOpenRecruitment(userId: string, projectId: string) {
  const actor = await requireActor(userId);
  return getOpenRecruitmentWithDatabase(getDatabase(), actor, projectId);
}
