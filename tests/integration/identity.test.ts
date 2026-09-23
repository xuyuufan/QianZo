import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";

import {
  completeOnboardingWithDatabase,
  getActorByIdWithDatabase,
  IdentityError,
} from "@/modules/identity/onboarding";
import { users } from "@/platform/db/schema";
import * as schema from "@/platform/db/schema";

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle<typeof schema>>;
let authAdmin: SupabaseClient;
let enterpriseId: string;
let metadataOnlyId: string;
let testPassword: string;

async function ensureAuthUser(email: string, metadata: Record<string, unknown> = {}) {
  const { data: page, error: listError } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = page.users.find((user) => user.email === email);
  if (existing) return existing.id;
  const { data, error } = await authAdmin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user.id;
}

beforeAll(async () => {
  const { tools, app } = loadLocalEnv(resolve(import.meta.dirname, "../.."));
  if (!tools.DEMO_USER_PASSWORD) throw new Error("DEMO_USER_PASSWORD is required.");
  testPassword = tools.DEMO_USER_PASSWORD;
  admin = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
    max: 1,
    prepare: false,
  });
  runtime = postgres(requireLoopbackDatabaseUrl(app.DATABASE_URL, "DATABASE_URL"), {
    max: 1,
    prepare: false,
  });
  database = drizzle(runtime, { schema });
  authAdmin = createClient(
    requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    tools.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  enterpriseId = await ensureAuthUser("identity-enterprise@qianzo.test");
  metadataOnlyId = await ensureAuthUser("identity-metadata@qianzo.test", { role: "ADMIN" });
  await admin`delete from app.user_roles where user_id in (${enterpriseId}, ${metadataOnlyId})`;
  await admin`delete from app.users where id in (${enterpriseId}, ${metadataOnlyId})`;
});

afterAll(async () => {
  await Promise.all([admin.end(), runtime.end()]);
});

describe("identity onboarding", () => {
  it("creates a profile and allowed role with the Auth user id", async () => {
    const actor = await completeOnboardingWithDatabase(database, enterpriseId, {
      displayName: "  测试企业  ",
      roles: ["ENTERPRISE"],
    });
    expect(actor).toMatchObject({
      id: enterpriseId,
      displayName: "测试企业",
      status: "ACTIVE",
      roles: ["ENTERPRISE"],
    });
  });

  it("is repeatable, updates the name, adds roles, and does not duplicate or remove roles", async () => {
    await completeOnboardingWithDatabase(database, enterpriseId, {
      displayName: "更新后的企业",
      roles: ["BUILDER"],
    });
    await completeOnboardingWithDatabase(database, enterpriseId, {
      displayName: "更新后的企业",
      roles: ["BUILDER"],
    });
    const actor = await getActorByIdWithDatabase(database, enterpriseId);
    expect(actor).toMatchObject({
      displayName: "更新后的企业",
      roles: ["BUILDER", "ENTERPRISE"],
    });
  });

  it("rejects unapproved roles", async () => {
    await expect(
      completeOnboardingWithDatabase(database, enterpriseId, {
        displayName: "测试企业",
        roles: ["ADMIN"],
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("does not reactivate or rename a disabled user", async () => {
    await admin`update app.users set status = 'DISABLED' where id = ${enterpriseId}`;
    await expect(
      completeOnboardingWithDatabase(database, enterpriseId, {
        displayName: "不应保存",
        roles: ["ENTERPRISE"],
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<IdentityError>>({ code: "ACTOR_DISABLED" }));
    const [profile] = await database
      .select({ displayName: users.displayName, status: users.status })
      .from(users)
      .where(eq(users.id, enterpriseId));
    expect(profile).toEqual({ displayName: "更新后的企业", status: "DISABLED" });
    await admin`update app.users set status = 'ACTIVE' where id = ${enterpriseId}`;
  });

  it("does not treat Auth metadata as a platform role", async () => {
    expect(await getActorByIdWithDatabase(database, metadataOnlyId)).toBeNull();
  });
});
