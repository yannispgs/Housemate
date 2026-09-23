import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Suite unitaire : `node`, aucune base de données, aucun navigateur.
 * Elle couvre `src/lib`, qui est pur par construction — c'est là que vivent les
 * bogues coûteux (conventions § 11).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
