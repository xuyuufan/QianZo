import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import { parse } from "dotenv";
import postgres from "postgres";

import { completeOnboardingWithDatabase } from "@/modules/identity/onboarding";
import * as schema from "@/platform/db/schema";

const root = resolve(import.meta.dirname, "..");
const tools = parse(readFileSync(resolve(root, ".env.tools.local"), "utf8"));
const app = parse(readFileSync(resolve(root, ".env.local"), "utf8"));

function requireLoopback(value: string | undefined, name: string, protocol: string) {
  if (!value) throw new Error(`${name} is missing. Run pnpm db:prepare first.`);
  const url = new URL(value);
  if (url.protocol !== protocol || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`${name} must target the local synthetic environment.`);
  }
  return value;
}

const apiUrl = requireLoopback(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL", "http:");
const databaseUrl = requireLoopback(app.DATABASE_URL, "DATABASE_URL", "postgresql:");
if (!tools.SUPABASE_SERVICE_ROLE_KEY || !tools.DEMO_USER_PASSWORD) {
  throw new Error("Tool credentials are missing. Run pnpm db:prepare first.");
}

const authAdmin = createClient(apiUrl, tools.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const accounts = [
  { email: "enterprise-a@qianzo.local", displayName: "示例企业 A", roles: ["ENTERPRISE"] as const },
  { email: "enterprise-b@qianzo.local", displayName: "示例企业 B", roles: ["ENTERPRISE"] as const },
  { email: "builder@qianzo.local", displayName: "示例 Builder", roles: ["BUILDER"] as const },
];

async function main() {
  const { data: existingPage, error: listError } = await authAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const database = drizzle(sql, { schema });

  try {
    for (const account of accounts) {
      let user = existingPage.users.find((candidate) => candidate.email === account.email);
      if (!user) {
        const { data, error } = await authAdmin.auth.admin.createUser({
          email: account.email,
          password: tools.DEMO_USER_PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        user = data.user;
      } else {
        const { error } = await authAdmin.auth.admin.updateUserById(user.id, {
          password: tools.DEMO_USER_PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
      }

      await completeOnboardingWithDatabase(database, user.id, {
        displayName: account.displayName,
        roles: [...account.roles],
      });
    }
  } finally {
    await sql.end();
  }

  console.log(
    "Prepared enterprise-a@qianzo.local, enterprise-b@qianzo.local, and builder@qianzo.local.",
  );
  console.log("Their shared password remains only in .env.tools.local.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
});
