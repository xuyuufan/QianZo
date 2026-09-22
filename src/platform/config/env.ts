import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  APP_ENV: z.literal("local"),
  APP_BASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgresql://"), {
    message: "must be a PostgreSQL URL",
  }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new Error(`Missing or invalid server environment variables: ${names}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}
