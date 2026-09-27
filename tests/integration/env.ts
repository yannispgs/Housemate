/**
 * Connexion à la base locale de développement (compose.yaml). Les valeurs par
 * défaut sont celles de la base Docker, liée à 127.0.0.1 : ce ne sont pas des
 * secrets.
 */
export const DIRECT_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://neondb_owner:housemate-local@127.0.0.1:55432/neondb";
