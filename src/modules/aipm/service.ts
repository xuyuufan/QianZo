import "server-only";

import { invokeAipmWithDatabase } from "@/modules/aipm/invocation";
import { mockAipmGateway } from "@/modules/aipm/mock-gateway";
import { getProjectInterviewWithDatabase } from "@/modules/aipm/repository";
import { requireRole } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

export async function invokeAipm(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return invokeAipmWithDatabase(getDatabase(), actor, mockAipmGateway, input);
}

export async function getProjectInterview(userId: string, projectId: string) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return getProjectInterviewWithDatabase(getDatabase(), actor, projectId);
}
