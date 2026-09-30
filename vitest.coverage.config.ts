import { defineConfig } from "vitest/config";

/**
 * Couverture, utilisée par le job CI « Coverage » et envoyée à Codecov.
 *
 * Unitaire ET intégration, fusionnées : la couverture doit refléter tout ce
 * que les tests exercent réellement (conventions § 11). Il faut donc la base
 * locale (`yarn db:up`, puis `yarn db:migrate`).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: ["./vitest.config.ts", "./vitest.integration.config.ts"],
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
      // De même pour le socket SMTP : il n'existe que dans le moteur des
      // Workers (`cloudflare:sockets`), et le dialogue qu'il transporte est
      // testé à part (`smtp.ts`).
      exclude: [
        "**/*.test.ts",
        "workers/*/src/index.ts",
        "workers/*/src/smtp-socket.ts",
      ],
      // Produire un rapport même si un test échoue, pour que Codecov en ait
      // toujours un.
      reportOnFailure: true,
    },
  },
});
