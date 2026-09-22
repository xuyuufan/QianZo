import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

const repositoryRoot = resolve(import.meta.dirname, "..");
const supabaseCli = resolve(repositoryRoot, "node_modules/supabase/dist/supabase.js");
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export function runSupabase(args, options = {}) {
  const result = spawnSync(process.execPath, [supabaseCli, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    throw new Error(`Supabase command failed: ${args.join(" ")}`);
  }

  return result.stdout ?? "";
}

export function readSupabaseStatus() {
  const output = execFileSync(
    process.execPath,
    [supabaseCli, "status", "-o", "env"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return parse(output);
}

export function assertLoopbackDatabaseUrl(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid URL.`);
  }

  if (url.protocol !== "postgresql:" || !loopbackHosts.has(url.hostname)) {
    throw new Error(`${variableName} must target a loopback PostgreSQL instance.`);
  }

  return url;
}

export function readOptionalEnv(path) {
  return existsSync(path) ? parse(readFileSync(path, "utf8")) : {};
}

export function createSecret(prefix) {
  return `${prefix}${randomBytes(24).toString("base64url")}`;
}

export function writeEnvFile(path, values, header) {
  const lines = [header, ...Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`)];
  writeFileSync(path, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
}
