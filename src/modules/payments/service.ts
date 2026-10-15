import "server-only";

import { requireRole } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import { mockPaymentProvider } from "./mock-provider";
import {
  createEnterpriseDepositWithDatabase,
  getProjectPaymentWithDatabase,
  simulatePaymentSuccessWithDatabase,
} from "./repository";

export async function createEnterpriseDeposit(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return createEnterpriseDepositWithDatabase(getDatabase(), actor, mockPaymentProvider, input);
}

export async function simulatePaymentSuccess(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return simulatePaymentSuccessWithDatabase(getDatabase(), actor, input);
}

export async function getProjectPayment(userId: string, projectId: string) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return getProjectPaymentWithDatabase(getDatabase(), actor, projectId);
}
