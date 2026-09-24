import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import { enterpriseDeposit } from "@/modules/payments/mock-provider";
import type { PaymentCreationRequest, PaymentProvider } from "@/modules/payments/provider";
import {
  createEnterpriseDepositWithDatabase,
  getProjectPaymentWithDatabase,
  simulatePaymentSuccessWithDatabase,
} from "@/modules/payments/repository";
import { createProjectWithDatabase } from "@/modules/projects/repository";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";

import { clearDemoBusinessData } from "../helpers/demo-data";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { createProjectWithBudgetAndSpec, lockProjectScope } from "../helpers/project-fixture";

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
let database: Database;
let authAdmin: SupabaseClient;
let enterpriseA: Actor;
let enterpriseB: Actor;
let builder: Actor;
let userIds: string[] = [];

/** Counts provider calls and proves the provider is reached outside a lock. */
function createRecordingProvider() {
  const requests: PaymentCreationRequest[] = [];
  const provider: PaymentProvider = {
    async createPayment(request) {
      requests.push(request);
      // The project row must be lockable while the provider is being called.
      await runtime`select id from app.projects where id = ${request.projectId} for update nowait`;
    },
  };
  return { provider, requests };
}

async function countPayments(projectId: string) {
  const [row] = await admin<{ count: string }[]>`
    select count(*)::text as count from app.payments where project_id = ${projectId}
  `;
  return Number(row.count);
}

async function rawProjectVersion(projectId: string) {
  const [row] = await admin<{ version: number }[]>`
    select version from app.projects where id = ${projectId}
  `;
  return row.version;
}

async function rawPayment(paymentId: string) {
  const [row] = await admin<
    {
      status: string;
      amount_minor: string;
      currency: string;
      purpose: string;
      payer_id: string;
      succeeded_at: Date | null;
    }[]
  >`
    select status, amount_minor, currency, purpose, payer_id, succeeded_at
    from app.payments where id = ${paymentId}
  `;
  return row;
}

/** A locked project owned by enterprise A. */
async function createLockedProject() {
  const fixture = await createProjectWithBudgetAndSpec(database, enterpriseA);
  await lockProjectScope(database, enterpriseA, fixture);
  return fixture;
}

beforeAll(async () => {
  const { tools, app } = loadLocalEnv(resolve(import.meta.dirname, "../.."));
  if (!tools.DEMO_USER_PASSWORD) throw new Error("DEMO_USER_PASSWORD is required.");

  admin = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
    max: 1,
    prepare: false,
  });
  runtime = postgres(requireLoopbackDatabaseUrl(app.DATABASE_URL, "DATABASE_URL"), {
    max: 5,
    prepare: false,
  });
  database = drizzle(runtime, { schema });
  authAdmin = createClient(
    requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    tools.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  userIds = await Promise.all([
    ensureAuthUser("deposit-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("deposit-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("deposit-builder@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await clearDemoBusinessData(admin, userIds);
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "定金测试企业 A",
    roles: ["ENTERPRISE"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "定金测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builder = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "定金测试 Builder",
    roles: ["BUILDER"],
  });
});

async function ensureAuthUser(email: string, password: string) {
  const { data: page, error: listError } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = page.users.find((user) => user.email === email);
  if (existing) return existing.id;
  const { data, error } = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

beforeEach(async () => {
  await clearDemoBusinessData(admin, userIds);
});

afterAll(async () => {
  if (admin && userIds.length) {
    await clearDemoBusinessData(admin, userIds);
    await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
    await admin`delete from app.users where id in ${admin(userIds)}`;
    for (const userId of userIds) {
      const { error } = await authAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  }
  await Promise.all([admin?.end(), runtime?.end()]);
});

describe("enterprise mock deposit", () => {
  it("creates the fixed deposit once and never reaches the provider again", async () => {
    const fixture = await createLockedProject();
    const { provider, requests } = createRecordingProvider();

    const first = await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });
    const replay = await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });

    expect(replay.id).toBe(first.id);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      projectId: fixture.project.id,
      payerId: enterpriseA.id,
      purpose: enterpriseDeposit.purpose,
      amountMinor: enterpriseDeposit.amountMinor,
      currency: enterpriseDeposit.currency,
    });

    const stored = await rawPayment(first.id);
    expect(stored).toMatchObject({
      status: "PENDING",
      amount_minor: "100",
      currency: "CNY",
      purpose: "ENTERPRISE_DEPOSIT",
      payer_id: enterpriseA.id,
    });
    expect(stored.succeeded_at).toBeNull();
    expect(await countPayments(fixture.project.id)).toBe(1);
    // Creating a deposit is not a project state change.
    expect(await rawProjectVersion(fixture.project.id)).toBe(fixture.projectVersion + 1);
  });

  it("refuses a deposit for an unlocked project, another enterprise or a builder", async () => {
    const unlocked = await createProjectWithBudgetAndSpec(database, enterpriseA);
    const locked = await createLockedProject();
    const { provider, requests } = createRecordingProvider();

    await expect(
      createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
        projectId: unlocked.project.id,
      }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "SPEC_LOCKED" });

    await expect(
      createEnterpriseDepositWithDatabase(database, enterpriseB, provider, {
        projectId: locked.project.id,
      }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "NOT_FOUND" });

    await expect(
      createEnterpriseDepositWithDatabase(database, builder, provider, {
        projectId: locked.project.id,
      }),
    ).rejects.toMatchObject({ name: "IdentityError", code: "ROLE_REQUIRED" });

    expect(requests).toHaveLength(0);
    expect(await countPayments(locked.project.id)).toBe(0);
    expect(await countPayments(unlocked.project.id)).toBe(0);
  });

  it("simulates success once, moves the project version and replays without changes", async () => {
    const fixture = await createLockedProject();
    const { provider } = createRecordingProvider();
    const payment = await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });
    const versionBefore = await rawProjectVersion(fixture.project.id);

    const succeeded = await simulatePaymentSuccessWithDatabase(database, enterpriseA, {
      paymentId: payment.id,
    });

    expect(succeeded.status).toBe("SUCCEEDED");
    expect(succeeded.succeededAt).not.toBeNull();
    expect(await rawProjectVersion(fixture.project.id)).toBe(versionBefore + 1);

    const replay = await simulatePaymentSuccessWithDatabase(database, enterpriseA, {
      paymentId: payment.id,
    });

    expect(replay.status).toBe("SUCCEEDED");
    expect(replay.succeededAt?.getTime()).toBe(succeeded.succeededAt?.getTime());
    expect(replay.updatedAt.getTime()).toBe(succeeded.updatedAt.getTime());
    expect(await rawProjectVersion(fixture.project.id)).toBe(versionBefore + 1);
    expect(await countPayments(fixture.project.id)).toBe(1);
  });

  it("refuses to simulate someone else's payment and reports a missing one as absent", async () => {
    const fixture = await createLockedProject();
    const { provider } = createRecordingProvider();
    const payment = await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });

    await expect(
      simulatePaymentSuccessWithDatabase(database, enterpriseB, { paymentId: payment.id }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "NOT_FOUND" });

    await expect(
      simulatePaymentSuccessWithDatabase(database, builder, { paymentId: payment.id }),
    ).rejects.toMatchObject({ name: "IdentityError", code: "ROLE_REQUIRED" });

    await expect(
      simulatePaymentSuccessWithDatabase(database, enterpriseA, { paymentId: randomUUID() }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "NOT_FOUND" });

    const stored = await rawPayment(payment.id);
    expect(stored.status).toBe("PENDING");
  });

  it("lets only one of two concurrent simulations change the payment", async () => {
    const fixture = await createLockedProject();
    const { provider } = createRecordingProvider();
    const payment = await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });
    const versionBefore = await rawProjectVersion(fixture.project.id);

    const results = await Promise.allSettled([
      simulatePaymentSuccessWithDatabase(database, enterpriseA, { paymentId: payment.id }),
      simulatePaymentSuccessWithDatabase(database, enterpriseA, { paymentId: payment.id }),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await rawProjectVersion(fixture.project.id)).toBe(versionBefore + 1);
    expect(await countPayments(fixture.project.id)).toBe(1);

    const stored = await rawPayment(payment.id);
    expect(stored.status).toBe("SUCCEEDED");
  });

  it("blocks a succeeded payment from being reverted or retimed, even by SQL", async () => {
    const fixture = await createLockedProject();
    const { provider } = createRecordingProvider();
    const payment = await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });
    await simulatePaymentSuccessWithDatabase(database, enterpriseA, { paymentId: payment.id });
    const succeeded = await rawPayment(payment.id);

    const statements = [
      `update app.payments set status = 'PENDING' where id = '${payment.id}'`,
      `update app.payments set succeeded_at = now() where id = '${payment.id}'`,
      `update app.payments set succeeded_at = null where id = '${payment.id}'`,
      `update app.payments set amount_minor = 5 where id = '${payment.id}'`,
      `update app.payments set payer_id = gen_random_uuid() where id = '${payment.id}'`,
    ];

    for (const statement of statements) {
      await expect(runtime.unsafe(statement), statement).rejects.toMatchObject({ severity: "ERROR" });
    }

    const stored = await rawPayment(payment.id);
    expect(stored.status).toBe("SUCCEEDED");
    expect(stored.succeeded_at?.getTime()).toBe(succeeded.succeeded_at?.getTime());
    expect(stored.amount_minor).toBe("100");
    expect(stored.payer_id).toBe(enterpriseA.id);
  });

  it("keeps the deposit private to its owner", async () => {
    const fixture = await createLockedProject();
    const { provider } = createRecordingProvider();
    await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });

    const mine = await getProjectPaymentWithDatabase(database, enterpriseA, fixture.project.id);
    expect(mine?.payment?.status).toBe("PENDING");
    expect(await getProjectPaymentWithDatabase(database, enterpriseB, fixture.project.id)).toBeNull();
    await expect(getProjectPaymentWithDatabase(database, builder, fixture.project.id)).rejects.toMatchObject({
      name: "IdentityError",
      code: "ROLE_REQUIRED",
    });
  });

  it("keeps the amount, currency, purpose and status agreement in the database", async () => {
    const fixture = await createLockedProject();
    const insert = (values: string) => admin.unsafe(`
      insert into app.payments (id, project_id, payer_id, purpose, amount_minor, currency, status, succeeded_at)
      values (gen_random_uuid(), '${fixture.project.id}', '${enterpriseA.id}', ${values})
    `);

    await expect(insert("'ENTERPRISE_DEPOSIT', 0, 'CNY', 'PENDING', null")).rejects.toMatchObject({
      severity: "ERROR",
    });
    await expect(insert("'ENTERPRISE_DEPOSIT', 100, 'cny', 'PENDING', null")).rejects.toMatchObject({
      severity: "ERROR",
    });
    await expect(insert("'ENTERPRISE_DEPOSIT', 100, 'CNY', 'SUCCEEDED', null")).rejects.toMatchObject({
      severity: "ERROR",
    });
    await expect(insert("'ENTERPRISE_DEPOSIT', 100, 'CNY', 'PENDING', now()")).rejects.toMatchObject({
      severity: "ERROR",
    });
    // The builder deposit purpose is not part of this slice.
    await expect(insert("'BUILDER_DEPOSIT', 100, 'CNY', 'PENDING', null")).rejects.toMatchObject({
      severity: "ERROR",
    });
  });

  it("keeps one deposit per project and purpose", async () => {
    const fixture = await createLockedProject();
    const { provider } = createRecordingProvider();
    await createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
      projectId: fixture.project.id,
    });

    await expect(
      admin.unsafe(`
        insert into app.payments (id, project_id, payer_id, purpose, amount_minor, currency)
        values (gen_random_uuid(), '${fixture.project.id}', '${enterpriseA.id}', 'ENTERPRISE_DEPOSIT', 100, 'CNY')
      `),
    ).rejects.toMatchObject({ severity: "ERROR" });
  });

  it("lets two concurrent creates produce exactly one deposit with one id", async () => {
    const fixture = await createLockedProject();
    // A provider with no lock dance: the point here is the create race itself.
    const provider: PaymentProvider = {
      async createPayment() {
        return undefined;
      },
    };

    const results = await Promise.allSettled([
      createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
        projectId: fixture.project.id,
      }),
      createEnterpriseDepositWithDatabase(database, enterpriseA, provider, {
        projectId: fixture.project.id,
      }),
    ]);

    // Both callers walk away with the same payment; UNIQUE(project_id, purpose)
    // plus the re-read under the project lock keep it to a single order.
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const payments = results.map(
      (result) =>
        (result as PromiseFulfilledResult<Awaited<ReturnType<typeof createEnterpriseDepositWithDatabase>>>)
          .value,
    );
    expect(payments[1].id).toBe(payments[0].id);
    expect(payments[1].status).toBe("PENDING");

    expect(await countPayments(fixture.project.id)).toBe(1);
    // Creating a deposit is not a project state change, not even concurrently.
    expect(await rawProjectVersion(fixture.project.id)).toBe(fixture.projectVersion + 1);
  });
});

describe("deposit stage guards", () => {
  it("requires the scope to be locked before a deposit exists", async () => {
    const draft = await createProjectWithDatabase(database, enterpriseA, {
      projectId: randomUUID(),
      title: "未锁定项目",
      originalRequirement: "",
    });
    const { provider, requests } = createRecordingProvider();

    await expect(
      createEnterpriseDepositWithDatabase(database, enterpriseA, provider, { projectId: draft.id }),
    ).rejects.toMatchObject({ name: "PaymentError", code: "SPEC_LOCKED" });

    expect(requests).toHaveLength(0);
    expect(await countPayments(draft.id)).toBe(0);
  });
});
