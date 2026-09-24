import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // Every spec shares one local database and clears the same synthetic demo
  // projects, so the files must not run concurrently.
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    // Run the E2E specs against a production build. `next dev` compiles Server
    // Actions on first use, which can time out the first spec; a fresh
    // `build && start` is reproducible and has no such cold-start jitter.
    // `corepack pnpm` is used because this machine's `pnpm` is not on PATH and
    // corepack ships with Node 24, so a fresh shell can run it with no setup.
    command: "corepack pnpm build && corepack pnpm start",
    url: "http://127.0.0.1:3000",
    // Reuse a server that is already serving 127.0.0.1:3000 (dev or start)
    // locally, but never in CI where the environment must be built fresh.
    reuseExistingServer: !process.env.CI,
    // The production build runs in the same command, so allow enough time.
    timeout: 300_000,
  },
});
