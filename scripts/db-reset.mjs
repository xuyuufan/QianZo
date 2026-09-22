import { pathToFileURL } from "node:url";

import { prepareDatabase } from "./db-prepare.mjs";
import { assertLoopbackDatabaseUrl, readSupabaseStatus, runSupabase } from "./local-supabase.mjs";

async function resetDatabase() {
  const status = readSupabaseStatus();
  if (!status.DB_URL) {
    throw new Error("The local Supabase instance did not report a database URL.");
  }

  assertLoopbackDatabaseUrl(status.DB_URL, "SUPABASE_DB_ADMIN_URL");
  console.log("Resetting the loopback-only synthetic database. Existing local data will be removed.");
  runSupabase(["db", "reset", "--local"]);
  await prepareDatabase();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : "Database reset failed.");
    process.exitCode = 1;
  });
}
