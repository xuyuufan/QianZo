import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import {
  assertLoopbackDatabaseUrl,
  createSecret,
  readOptionalEnv,
  readSupabaseStatus,
  runSupabase,
  writeEnvFile,
} from "./local-supabase.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const toolsEnvPath = resolve(repositoryRoot, ".env.tools.local");
const appEnvPath = resolve(repositoryRoot, ".env.local");

export async function prepareDatabase() {
  const status = readSupabaseStatus();
  const adminUrlValue = status.DB_URL;
  const publicApiUrl = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;

  if (!adminUrlValue || !publicApiUrl || !publishableKey || !serviceRoleKey) {
    throw new Error("The running local Supabase instance did not report all required values.");
  }

  const adminUrl = assertLoopbackDatabaseUrl(adminUrlValue, "SUPABASE_DB_ADMIN_URL");
  const existingToolsEnv = readOptionalEnv(toolsEnvPath);
  const runtimePassword = existingToolsEnv.QIANZO_RUNTIME_PASSWORD || createSecret("QzR_");
  const demoPassword = existingToolsEnv.DEMO_USER_PASSWORD || createSecret("QzD!");

  writeEnvFile(
    toolsEnvPath,
    {
      SUPABASE_DB_ADMIN_URL: adminUrl.toString(),
      QIANZO_RUNTIME_PASSWORD: runtimePassword,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      DEMO_USER_PASSWORD: demoPassword,
    },
    "# Generated for local tools only. Never load this file in the Next.js runtime.",
  );

  runSupabase(["migration", "up", "--local"]);

  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
  const escapedPassword = runtimePassword.replaceAll("'", "''");
  try {
    await admin.unsafe(`alter role qianzo_runtime password '${escapedPassword}'`);
  } finally {
    await admin.end();
  }

  const runtimeUrl = new URL(adminUrl);
  runtimeUrl.username = "qianzo_runtime";
  runtimeUrl.password = runtimePassword;

  writeEnvFile(
    appEnvPath,
    {
      APP_ENV: "local",
      APP_BASE_URL: "http://127.0.0.1:3000",
      NEXT_PUBLIC_SUPABASE_URL: publicApiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      DATABASE_URL: runtimeUrl.toString(),
    },
    "# Generated from the local Supabase instance. Contains runtime-only credentials.",
  );

  const runtime = postgres(runtimeUrl.toString(), { max: 1, prepare: false });
  try {
    const [identity] = await runtime`select current_user as user_name`;
    if (identity.user_name !== "qianzo_runtime") {
      throw new Error("Runtime database verification used an unexpected role.");
    }
  } finally {
    await runtime.end();
  }

  console.log("Local migrations and the restricted runtime connection are ready.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : "Database preparation failed.");
    process.exitCode = 1;
  });
}
