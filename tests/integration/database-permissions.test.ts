import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Sql = ReturnType<typeof postgres>;

let admin: Sql;
let runtime: Sql;
let apiUrl: string;
let anonKey: string;

function requireLoopbackDatabaseUrl(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required. Run pnpm db:prepare first.`);
  }
  const url = new URL(value);
  if (url.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`${name} must use loopback PostgreSQL.`);
  }
  return url.toString();
}

beforeAll(() => {
  const root = resolve(import.meta.dirname, "../..");
  const tools = parse(readFileSync(resolve(root, ".env.tools.local"), "utf8"));
  const app = parse(readFileSync(resolve(root, ".env.local"), "utf8"));
  admin = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
    max: 1,
    prepare: false,
  });
  runtime = postgres(requireLoopbackDatabaseUrl(app.DATABASE_URL, "DATABASE_URL"), {
    max: 1,
    prepare: false,
  });
  apiUrl = app.NEXT_PUBLIC_SUPABASE_URL;
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

  it.each([
    ["create tables", "create table app.forbidden_table (id integer)"],
    ["delete rows", "delete from app.projects"],
    ["truncate rows", "truncate app.projects"],
    ["change an owner", "update app.projects set owner_id = gen_random_uuid()"],
    ["change project status", "update app.projects set status = 'OPEN'"],
    ["change user status", "update app.users set status = 'DISABLED'"],
    ["elevate roles", "alter role qianzo_runtime superuser"],
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
