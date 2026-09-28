/**
 * Connexion à la base locale de développement (compose.yaml), liée à
 * 127.0.0.1 et sans mot de passe.
 */
export const DIRECT_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://neondb_owner@127.0.0.1:55432/neondb";
