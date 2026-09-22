import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getServerEnv } from "@/platform/config/env";

import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  qianzoSql?: ReturnType<typeof postgres>;
};

function getSqlClient() {
  if (!globalForDatabase.qianzoSql) {
    globalForDatabase.qianzoSql = postgres(getServerEnv().DATABASE_URL, {
      max: 10,
      prepare: false,
    });
  }

  return globalForDatabase.qianzoSql;
}

export function getDatabase() {
  return drizzle(getSqlClient(), { schema });
}

export type Database = ReturnType<typeof getDatabase>;
