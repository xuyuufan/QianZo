import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadLocalEnv,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";

/**
 * Replays the full migration chain on a scratch database and asserts the
 * rebuilt schema. The scratch database is created and dropped by this file
 * only; the local demo database (`postgres`) is never modified — every
 * database-scoped statement in the chain targets `current_database()`, and the
 * single hard-coded one (`grant connect on database postgres`) is a no-op
 * because the runtime role already holds that privilege.
 *
 * Replaying the chain executes `alter role qianzo_runtime`, which only a
 * superuser may run, and the tool admin role (`postgres`) is not a superuser in
 * the local stack. The verification therefore connects as `supabase_admin` —
 * the role the S1 hand-off used; `SUPABASE_DB_SUPERUSER_URL` overrides it when a
 * stack exposes a different superuser. When no superuser connection is
 * available the suite is *skipped*, with the reason printed once, so a missing
 * credential is never mistaken for a broken migration chain.
 *
 * `auth.users` is a minimal stub on the scratch database, standing in for the
 * Supabase platform objects the S1 rebuild verification also used.
 */

const scratchDatabaseName = "qianzo_migration_rebuild";

type Sql = ReturnType<typeof postgres>;
type ToolsEnv = Record<string, string | undefined>;
type SuperuserProbe = { ok: true; url: string } | { ok: false; reason: string };

function loadToolsEnv(): ToolsEnv | null {
  try {
    return loadLocalEnv(resolve(import.meta.dirname, "../..")).tools;
  } catch {
    return null;
  }
}

function resolveSuperuserUrl(tools: ToolsEnv): URL {
  if (tools.SUPABASE_DB_SUPERUSER_URL) {
    return new URL(
      requireLoopbackDatabaseUrl(tools.SUPABASE_DB_SUPERUSER_URL, "SUPABASE_DB_SUPERUSER_URL"),
    );
  }
  const adminUrl = new URL(
    requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"),
  );
  adminUrl.username = "supabase_admin";
  return adminUrl;
}

async function probeSuperuser(tools: ToolsEnv | null): Promise<SuperuserProbe> {
  if (!tools) {
    return { ok: false, reason: ".env.tools.local 不存在，无法取得管理员连接串" };
  }

  let url: URL;
  try {
    url = resolveSuperuserUrl(tools);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }

  const probe = postgres(url.toString(), { max: 1, prepare: false });
  try {
    const [role] = await probe<{ is_superuser: boolean }[]>`
      select rolsuper as is_superuser from pg_roles where rolname = current_user
    `;
    if (!role?.is_superuser) {
      return { ok: false, reason: `角色 ${url.username} 不是超级用户，无法重放 alter role 语句` };
    }
    return { ok: true, url: url.toString() };
  } catch (error) {
    return { ok: false, reason: `无法以 ${url.username} 连接：${(error as Error).message}` };
  } finally {
    await probe.end();
  }
}

const superuser = await probeSuperuser(loadToolsEnv());
const describeRebuild = superuser.ok ? describe : describe.skip;

if (!superuser.ok) {
  console.warn(`[migration-rebuild] 跳过空库迁移链重放验证：${superuser.reason}`);
}

let admin: Sql;
let scratch: Sql;

beforeAll(async () => {
  if (!superuser.ok) {
    return;
  }

  const adminUrl = new URL(superuser.url);

  admin = postgres(adminUrl.toString(), { max: 1, prepare: false });

  await admin.unsafe(`drop database if exists ${scratchDatabaseName} with (force)`);
  await admin.unsafe(`create database ${scratchDatabaseName}`);

  const scratchUrl = new URL(adminUrl);
  scratchUrl.pathname = `/${scratchDatabaseName}`;
  scratch = postgres(scratchUrl.toString(), { max: 1, prepare: false });

  // Minimal stand-in for the Supabase-managed auth schema.
  await scratch.unsafe("create schema if not exists auth");
  await scratch.unsafe("create table if not exists auth.users (id uuid primary key)");

  const migrationsDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  expect(migrationFiles.length).toBeGreaterThanOrEqual(9);

  for (const file of migrationFiles) {
    await scratch.unsafe(readFileSync(resolve(migrationsDirectory, file), "utf8"));
  }
});

afterAll(async () => {
  await scratch?.end();
  if (admin) {
    await admin.unsafe(`drop database if exists ${scratchDatabaseName} with (force)`);
    await admin.end();
  }
});

describeRebuild("migration chain rebuilt on an empty scratch database", () => {
  it("creates exactly the seven business tables", async () => {
    const tables = await scratch<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'app'
      order by table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([
      "aipm_messages",
      "aipm_sessions",
      "payments",
      "projects",
      "spec_versions",
      "user_roles",
      "users",
    ]);
  });

  it("installs the two guard triggers and nothing else", async () => {
    const triggers = await scratch<{ trigger_name: string }[]>`
      select trigger_name
      from information_schema.triggers
      where trigger_schema = 'app'
      order by trigger_name
    `;
    expect(triggers.map((row) => row.trigger_name)).toEqual([
      "payments_guard_success",
      "projects_guard_locked_scope",
    ]);
  });

  it("keeps only the two project→spec_version foreign keys deferrable, and they are deferred", async () => {
    const constraints = await scratch<
      { conname: string; condeferrable: boolean; condeferred: boolean; confdeltype: string }[]
    >`
      select conname, condeferrable, condeferred, confdeltype
      from pg_constraint
      where contype = 'f' and connamespace = 'app'::regnamespace
      order by conname
    `;

    const deferrable = constraints.filter((constraint) => constraint.condeferrable);
    expect(deferrable.map((constraint) => constraint.conname)).toEqual([
      "projects_current_spec_version_fk",
      "projects_locked_spec_version_fk",
    ]);
    for (const constraint of deferrable) {
      expect(constraint.condeferred).toBe(true);
      // NO ACTION, checked at commit — not ON DELETE RESTRICT, which ignores DEFERRABLE.
      expect(constraint.confdeltype).toBe("a");
    }

    // Every other foreign key keeps the default immediate RESTRICT behaviour.
    const immediate = constraints.filter((constraint) => !constraint.condeferrable);
    expect(immediate.length).toBeGreaterThan(0);
    for (const constraint of immediate) {
      expect(constraint.condeferred).toBe(false);
      expect(constraint.confdeltype).toBe("r");
    }
  });

  it("grants the runtime role the exact update columns on projects and payments", async () => {
    const updateColumns = async (table: string) =>
      (
        await scratch<{ column_name: string }[]>`
          select column_name
          from information_schema.column_privileges
          where grantee = 'qianzo_runtime'
            and table_schema = 'app'
            and table_name = ${table}
            and privilege_type = 'UPDATE'
          order by column_name
        `
      ).map((row) => row.column_name);

    expect(await updateColumns("projects")).toEqual([
      "budget_max_minor",
      "budget_min_minor",
      "currency",
      "current_spec_version_id",
      "locked_at",
      "locked_spec_version_id",
      "original_requirement",
      "published_at",
      "published_spec_snapshot",
      "status",
      "title",
      "updated_at",
      "version",
    ]);
    // The owner can never be rewritten by the runtime role.
    expect(await updateColumns("projects")).not.toContain("owner_id");

    expect(await updateColumns("payments")).toEqual(["status", "succeeded_at", "updated_at"]);
  });

  it("keeps the append-only history free of runtime update, delete or insert escape hatches", async () => {
    const updateColumns = await scratch<{ table_name: string; column_name: string }[]>`
      select table_name, column_name
      from information_schema.column_privileges
      where grantee = 'qianzo_runtime'
        and table_schema = 'app'
        and table_name in ('aipm_sessions', 'aipm_messages', 'spec_versions')
        and privilege_type = 'UPDATE'
    `;
    expect(updateColumns).toEqual([]);

    const deletions = await scratch<{ table_name: string }[]>`
      select table_name
      from information_schema.table_privileges
      where grantee = 'qianzo_runtime'
        and table_schema = 'app'
        and privilege_type = 'DELETE'
    `;
    expect(deletions).toEqual([]);

    // Server-controlled columns stay out of the runtime role's INSERT reach.
    const paymentInsertColumns = (
      await scratch<{ column_name: string }[]>`
        select column_name
        from information_schema.column_privileges
        where grantee = 'qianzo_runtime'
          and table_schema = 'app'
          and table_name = 'payments'
          and privilege_type = 'INSERT'
        order by column_name
      `
    ).map((row) => row.column_name);
    expect(paymentInsertColumns).toEqual([
      "amount_minor",
      "currency",
      "id",
      "payer_id",
      "project_id",
      "purpose",
    ]);
  });
});
