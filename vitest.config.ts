import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Every spec here is an integration test against one Postgres, and each holds a `pg`
    // connection for the life of the file while its PostgREST calls also occupy a backend
    // connection. The project database allows 60. Running files in parallel meant the
    // connection limit, not the code, decided whether a suite loaded — three separate
    // flakes surfaced as "Connection terminated unexpectedly" plus a hook timeout in
    // whichever file lost the race. Serial costs wall-clock and makes this deterministic.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});