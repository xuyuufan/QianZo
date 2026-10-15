import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws the moment it is imported outside a React Server
    // bundler. This alias points it at the package's own `empty.js`, which is
    // exactly what Next.js resolves via the `react-server` export condition, so
    // the integration tests can import the repository modules directly while the
    // production build keeps the real server-only boundary intact. It only
    // affects the Vitest resolver, never the app build.
    alias: {
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    restoreMocks: true,
  },
});
