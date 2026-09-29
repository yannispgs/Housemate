import { defineConfig } from "vitest/config";

/**
 * Suite d'intégration : contre la base locale façon Neon (`yarn db:up`, puis
 * `yarn db:migrate`), jamais contre une base hébergée (conventions § 11).
 * En série : les tests partagent une base.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
  },
});
