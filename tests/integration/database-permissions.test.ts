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

describe("S0 database boundary", () => {
  it("creates only the three S0 business tables", async () => {
    const tables = await admin<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'app'
      order by table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual(["projects", "user_roles", "users"]);
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
    ["change project status", "update app.projects set status = 'OPEN'"],
    ["change user status", "update app.users set status = 'DISABLED'"],
    ["elevate roles", "alter role qianzo_runtime superuser"],
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
  ])("does not let runtime %s", async (_label, statement) => {
    await expect(runtime.unsafe(statement)).rejects.toMatchObject({ severity: "ERROR" });
  });

  it.each(["anon", "authenticated"])("does not grant %s direct table access", async (role) => {
    await expect(
      admin.begin(async (transaction) => {
        await transaction.unsafe(`set local role ${role}`);
        await transaction`select * from app.projects`;
      }),
    ).rejects.toMatchObject({ severity: "ERROR" });
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
