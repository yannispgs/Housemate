import { defineConfig } from "vitest/config";

/**
 * Suite unitaire : `node`, aucune base de données, aucun navigateur.
 * Elle couvre `src/lib`, pur par construction — c'est là que vivent les bogues
 * coûteux (conventions § 11).
 */
export default defineConfig({
  // Reprend l'alias `@/*` depuis tsconfig.json (natif dans Vite 7+) plutôt que
  // de le redéclarer : une seule source de vérité, et pas d'`import.meta`, qui
  // ferait charger ce fichier comme du CommonJS contenant de l'ESM.
  resolve: { tsconfigPaths: true },
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
