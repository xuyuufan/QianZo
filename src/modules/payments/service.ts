import "server-only";

import { requireRole } from "@/modules/identity/service";
import { getDatabase } from "@/platform/db/client";

import { mockPaymentProvider } from "./mock-provider";
import {
  createBuilderDepositWithDatabase,
  createEnterpriseDepositWithDatabase,
  getBuilderDepositWithDatabase,
  getProjectPaymentWithDatabase,
  simulateBuilderDepositSuccessWithDatabase,
  simulatePaymentSuccessWithDatabase,
} from "./repository";

export async function createEnterpriseDeposit(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return createEnterpriseDepositWithDatabase(getDatabase(), actor, mockPaymentProvider, input);
}

export async function createBuilderDeposit(userId: string, input: unknown) {
  const actor = await requireRole(userId, "BUILDER");
  return createBuilderDepositWithDatabase(getDatabase(), actor, mockPaymentProvider, input);
}

export async function simulateBuilderDepositSuccess(userId: string, input: unknown) {
  const actor = await requireRole(userId, "BUILDER");
  return simulateBuilderDepositSuccessWithDatabase(getDatabase(), actor, input);
}

export async function getBuilderDeposit(userId: string, projectId: string) {
  const actor = await requireRole(userId, "BUILDER");
  return getBuilderDepositWithDatabase(getDatabase(), actor, projectId);
}

export async function simulatePaymentSuccess(userId: string, input: unknown) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return simulatePaymentSuccessWithDatabase(getDatabase(), actor, input);
}

export async function getProjectPayment(userId: string, projectId: string) {
  const actor = await requireRole(userId, "ENTERPRISE");
  return getProjectPaymentWithDatabase(getDatabase(), actor, projectId);
}
