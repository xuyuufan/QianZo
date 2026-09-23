import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export function loadLocalEnv(root: string) {
  return {
    tools: parse(readFileSync(resolve(root, ".env.tools.local"), "utf8")),
    app: parse(readFileSync(resolve(root, ".env.local"), "utf8")),
  };
}

export function requireLoopbackDatabaseUrl(value: string | undefined, name: string) {
  return requireLoopbackUrl(value, name, "postgresql:", "loopback PostgreSQL");
}

export function requireLoopbackApiUrl(value: string | undefined, name: string) {
  return requireLoopbackUrl(value, name, "http:", "loopback HTTP");
}

function requireLoopbackUrl(
  value: string | undefined,
  name: string,
  protocol: string,
  description: string,
) {
  if (!value) {
    throw new Error(`${name} is required. Run pnpm db:prepare first.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (url.protocol !== protocol || !loopbackHosts.has(url.hostname)) {
    throw new Error(`${name} must be a ${description} URL.`);
  }
  return url.toString();
}
