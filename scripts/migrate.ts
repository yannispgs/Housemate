/**
 * Applique les migrations de `db/migrations/` à la base de `MIGRATION_DATABASE_URL`.
 *
 *   MIGRATION_DATABASE_URL=… yarn db:migrate
 *
 * Code de sortie : 0 si la base est à jour, 1 sur une erreur (SQL, connexion),
 * 2 si l'historique de la base contredit les fichiers (migration modifiée,
 * disparue ou antérieure à la dernière appliquée).
 *
 * ⚠️ Connexion DIRECTE, jamais par le pool : le verrou consultatif qui empêche
 * deux exécutions simultanées vit dans la session, et un pool en mode
 * transaction le perdrait entre deux requêtes (docker/verify.sh, point 3).
 *
 * Chaque migration tourne dans sa propre transaction, avec son inscription dans
 * l'historique : elle s'applique entièrement ou pas du tout.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { planMigrations } from "../src/lib/db/migration-plan.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "db", "migrations");
// Arbitraire, mais fixe : c'est l'identité du verrou entre deux exécutions.
const LOCK_KEY = 72_470_001;

const url = process.env.MIGRATION_DATABASE_URL;

if (!url) {
  console.error("MIGRATION_DATABASE_URL manquante.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`select pg_advisory_lock(${LOCK_KEY})`;
  await sql`
    create table if not exists public.schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `;

  const names = (await readdir(MIGRATIONS_DIR))
    .filter(name => name.endsWith(".sql"))
    .sort();
  const contents = new Map<string, string>();
  const files = [];

  for (const name of names) {
    const content = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    contents.set(name, content);
    files.push({
      version: name,
      checksum: createHash("sha256").update(content).digest("hex"),
    });
  }

  const applied = await sql<{ version: string; checksum: string }[]>`
    select version, checksum from public.schema_migrations
  `;
  const plan = planMigrations(files, applied);

  if (!plan.ok) {
    for (const error of plan.errors) {
      console.error(`✗ ${error}`);
    }
    // Code distinct : l'historique de la base ne correspond plus aux fichiers.
    // Une preview y répond en repartant de `seed` ; une erreur SQL (code 1)
    // doit, elle, faire échouer (workflow `preview.yml`).
    process.exitCode = 2;
  } else if (plan.pending.length === 0) {
    console.log("Base à jour, aucune migration à appliquer.");
  } else {
    for (const migration of plan.pending) {
      await sql.begin(async tx => {
        await tx.unsafe(contents.get(migration.version) ?? "");
        await tx`
          insert into public.schema_migrations (version, checksum)
          values (${migration.version}, ${migration.checksum})
        `;
      });
      console.log(`✓ ${migration.version}`);
    }
  }
} finally {
  await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
  await sql.end();
}
