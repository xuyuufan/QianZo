import "server-only";

import { requireRole } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import {
  completeProjectWithDatabase,
  reviewDeliveryWithDatabase,
  submitDeliveryWithDatabase,
} from "./repository";

export async function submitDelivery(userId: string, input: unknown) {
  const actor = await requireRole(userId, "BUILDER");
  return submitDeliveryWithDatabase(getDatabase(), actor, input);
}

export async function reviewDelivery(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return reviewDeliveryWithDatabase(getDatabase(), actor, input);
}

export async function completeProject(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return completeProjectWithDatabase(getDatabase(), actor, input);
}
