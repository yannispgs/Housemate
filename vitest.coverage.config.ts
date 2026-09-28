import { defineConfig } from "vitest/config";

/**
 * Couverture, utilisée par le job CI « Coverage » et envoyée à Codecov.
 *
 * Elle ne regroupe aujourd'hui que la suite unitaire. La suite d'intégration
 * s'y ajoutera dans `projects` avec Supabase : la couverture doit refléter
 * tout ce que les tests exercent réellement (conventions § 11).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: ["./vitest.config.ts"],
    coverage: {
      provider: "v8",
      // text → journal de la CI ; lcov → Codecov (coverage/lcov.info).
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      // La couche logique, que les suites visent. L'interface se vérifie par
      // les previews et l'e2e, pas par des tests unitaires.
      include: ["src/lib/**/*.ts", "workers/*/src/**/*.ts"],
      // Le point d'entrée d'un Worker ne fait qu'assembler des modules testés
      // un à un ; il est vérifié par un essai réel, pas par un test unitaire.
      exclude: [
        "**/*.test.ts",
        "workers/*/src/index.ts",
        // Testé par la suite d'intégration, qui ne rejoint la couverture
        // qu'une fois la base locale disponible en CI (compose.yaml).
        // À retirer à ce moment-là.
        "workers/collecteur/src/store.ts",
      ],
      // Produire un rapport même si un test échoue, pour que Codecov en ait
      // toujours un.
      reportOnFailure: true,
    },
  },
});
