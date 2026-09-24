import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";

type Sql = ReturnType<typeof postgres>;

let admin: Sql;
let runtime: Sql;
let apiUrl: string;
let anonKey: string;

beforeAll(() => {
  const { tools, app } = loadLocalEnv(resolve(import.meta.dirname, "../.."));
  admin = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
    max: 1,
    prepare: false,
  });
  runtime = postgres(requireLoopbackDatabaseUrl(app.DATABASE_URL, "DATABASE_URL"), {
    max: 1,
    prepare: false,
  });
  apiUrl = requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  anonKey = app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
});

afterAll(async () => {
  await Promise.all([admin.end(), runtime.end()]);
});

const businessTables = [
  "aipm_messages",
  "aipm_sessions",
  "payments",
  "projects",
  "spec_versions",
  "user_roles",
  "users",
];

describe("application database boundary", () => {
  it("creates only the business tables the implemented slices use", async () => {
    const tables = await admin<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'app'
      order by table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual(businessTables);
  });

  it("connects as the restricted runtime role", async () => {
    const [identity] = await runtime<{ user_name: string; is_superuser: boolean }[]>`
      select current_user as user_name,
        (select rolsuper from pg_roles where rolname = current_user) as is_superuser
    `;
    expect(identity).toEqual({ user_name: "qianzo_runtime", is_superuser: false });
  });

  it("keeps the runtime role free of memberships it could assume", async () => {
    const memberships = await admin<{ parent_role: string }[]>`
      select parent.rolname as parent_role
      from pg_auth_members
      join pg_roles parent on parent.oid = pg_auth_members.roleid
      join pg_roles member on member.oid = pg_auth_members.member
      where member.rolname = 'qianzo_runtime'
    `;
    expect(memberships).toEqual([]);
  });

  it("grants the runtime role no relation-creating privilege of its own", async () => {
    const [privileges] = await admin<
      {
        can_create_temporary: boolean;
        can_create_database: boolean;
        can_create_app_schema: boolean;
        can_create_public_schema: boolean;
      }[]
    >`
      select
        has_database_privilege('qianzo_runtime', current_database(), 'TEMPORARY') as can_create_temporary,
        has_database_privilege('qianzo_runtime', current_database(), 'CREATE') as can_create_database,
        has_schema_privilege('qianzo_runtime', 'app', 'CREATE') as can_create_app_schema,
        has_schema_privilege('qianzo_runtime', 'public', 'CREATE') as can_create_public_schema
    `;
    expect(privileges).toEqual({
      can_create_temporary: false,
      can_create_database: false,
      can_create_app_schema: false,
      can_create_public_schema: false,
    });
  });

  it("removes a direct TEMPORARY grant from the runtime role", async () => {
    const hardening = readFileSync(
      resolve(import.meta.dirname, "../../supabase/migrations/20260922020000_s0_runtime_role_hardening.sql"),
      "utf8",
    );
    const [database] = await admin<{ name: string }[]>`select current_database() as name`;
    try {
      await admin`grant temporary on database ${admin(database.name)} to qianzo_runtime`;
      const [granted] = await admin<{ can_create_temporary: boolean }[]>`
        select has_database_privilege('qianzo_runtime', current_database(), 'TEMPORARY') as can_create_temporary
      `;
      expect(granted.can_create_temporary).toBe(true);
    } finally {
      // The role must never be left more privileged than the boundary allows.
      await admin.unsafe(hardening);
    }

    const [revoked] = await admin<{ can_create_temporary: boolean }[]>`
      select has_database_privilege('qianzo_runtime', current_database(), 'TEMPORARY') as can_create_temporary
    `;
    expect(revoked.can_create_temporary).toBe(false);
  });

  it.each([
    ["create tables", "create table app.forbidden_table (id integer)"],
    ["create a schema", "create schema forbidden_schema"],
    ["create a temporary table", "create temp table forbidden_temp (id integer)"],
    ["assume another role", "set role authenticator"],
    ["delete rows", "delete from app.projects"],
    ["truncate rows", "truncate app.projects"],
    ["change an owner", "update app.projects set owner_id = gen_random_uuid()"],
    ["change user status", "update app.users set status = 'DISABLED'"],
    ["elevate roles", "alter role qianzo_runtime superuser"],
    ["rewrite interview messages", "update app.aipm_messages set content = '改写历史'"],
    ["delete interview messages", "delete from app.aipm_messages"],
    ["move an interview session", "update app.aipm_sessions set project_id = gen_random_uuid()"],
    ["rewrite a spec version", "update app.spec_versions set content = '{}'::jsonb"],
    ["delete spec versions", "delete from app.spec_versions"],
    ["delete payments", "delete from app.payments"],
  ])("does not let runtime %s", async (_label, statement) => {
    await expect(runtime.unsafe(statement)).rejects.toMatchObject({ severity: "ERROR" });
  });

  it.each([
    [
      "insert a user with a chosen status",
      "insert into app.users (id, display_name, status) values (gen_random_uuid(), '越权', 'DISABLED')",
    ],
    [
      "insert a user with chosen timestamps",
      "insert into app.users (id, display_name, created_at) values (gen_random_uuid(), '越权', now())",
    ],
    [
      "insert a project with a chosen status",
      "insert into app.projects (id, owner_id, title, original_requirement, status) values (gen_random_uuid(), gen_random_uuid(), '越权', '', 'OPEN')",
    ],
    [
      "insert a project with a chosen version",
      "insert into app.projects (id, owner_id, title, original_requirement, version) values (gen_random_uuid(), gen_random_uuid(), '越权', '', 99)",
    ],
    [
      "insert a role with a chosen timestamp",
      "insert into app.user_roles (user_id, role, created_at) values (gen_random_uuid(), 'ENTERPRISE', now())",
    ],
    [
      "insert an interview message with a chosen timestamp",
      "insert into app.aipm_messages (id, session_id, sequence, role, content, created_at) values (gen_random_uuid(), gen_random_uuid(), 1, 'USER', '越权', now())",
    ],
    [
      "insert an interview session with a chosen timestamp",
      "insert into app.aipm_sessions (id, project_id, created_at) values (gen_random_uuid(), gen_random_uuid(), now())",
    ],
    [
      "insert a spec version with a chosen timestamp",
      "insert into app.spec_versions (id, project_id, version_no, schema_version, content, created_by, created_at) values (gen_random_uuid(), gen_random_uuid(), 1, 1, '{}'::jsonb, gen_random_uuid(), now())",
    ],
    [
      "insert a project with a chosen budget",
      "insert into app.projects (id, owner_id, title, original_requirement, currency) values (gen_random_uuid(), gen_random_uuid(), '越权', '', 'CNY')",
    ],
    [
      "insert a payment with a chosen status",
      "insert into app.payments (id, project_id, payer_id, purpose, amount_minor, currency, status) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'ENTERPRISE_DEPOSIT', 100, 'CNY', 'SUCCEEDED')",
    ],
  ])("does not let runtime %s", async (_label, statement) => {
    await expect(runtime.unsafe(statement)).rejects.toMatchObject({ severity: "ERROR" });
  });

  it("keeps the runtime column scope explicit", async () => {
    const [privileges] = await admin<
      {
        can_update_budget: boolean;
        can_update_locked_pointer: boolean;
        can_update_owner: boolean;
        can_update_status: boolean;
        can_insert_budget: boolean;
        can_update_payment_status: boolean;
        can_update_payment_amount: boolean;
        can_update_payment_payer: boolean;
        can_insert_payment_status: boolean;
      }[]
    >`
      select
        has_column_privilege('qianzo_runtime', 'app.projects', 'budget_min_minor', 'UPDATE') as can_update_budget,
        has_column_privilege('qianzo_runtime', 'app.projects', 'locked_spec_version_id', 'UPDATE') as can_update_locked_pointer,
        has_column_privilege('qianzo_runtime', 'app.projects', 'owner_id', 'UPDATE') as can_update_owner,
        has_column_privilege('qianzo_runtime', 'app.projects', 'status', 'UPDATE') as can_update_status,
        has_column_privilege('qianzo_runtime', 'app.projects', 'currency', 'INSERT') as can_insert_budget,
        has_column_privilege('qianzo_runtime', 'app.payments', 'status', 'UPDATE') as can_update_payment_status,
        has_column_privilege('qianzo_runtime', 'app.payments', 'amount_minor', 'UPDATE') as can_update_payment_amount,
        has_column_privilege('qianzo_runtime', 'app.payments', 'payer_id', 'UPDATE') as can_update_payment_payer,
        has_column_privilege('qianzo_runtime', 'app.payments', 'status', 'INSERT') as can_insert_payment_status
    `;

    expect(privileges).toEqual({
      can_update_budget: true,
      can_update_locked_pointer: true,
      can_update_owner: false,
      // The publish action owns the transition; the constraint still guards it.
      can_update_status: true,
      can_insert_budget: false,
      can_update_payment_status: true,
      can_update_payment_amount: false,
      can_update_payment_payer: false,
      can_insert_payment_status: false,
    });
  });

  it.each(["anon", "authenticated"])("does not grant %s direct table access", async (role) => {
    for (const table of businessTables) {
      await expect(
        admin.begin(async (transaction) => {
          await transaction.unsafe(`set local role ${role}`);
          await transaction.unsafe(`select * from app.${table}`);
        }),
      ).rejects.toMatchObject({ severity: "ERROR" });
    }
  });

  it("does not expose the app schema through the Data API", async () => {
    const response = await fetch(`${apiUrl}/rest/v1/projects?select=*`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Accept-Profile": "app",
      },
    });
    expect(response.ok).toBe(false);
    expect([400, 404, 406]).toContain(response.status);
  });
});
