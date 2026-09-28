/**
 * Ce qu'une exécution de migrations doit faire, calculé sans base de données.
 *
 * Une migration est un fichier SQL versionné, appliqué une seule fois. Une fois
 * appliquée, elle fait partie de l'histoire de la base : la modifier ensuite ne
 * change plus rien là où elle a déjà tourné, et crée deux bases qui prétendent
 * avoir le même schéma sans l'avoir. D'où le refus d'un fichier dont
 * l'empreinte a changé — la correction passe par une nouvelle migration.
 */

export interface MigrationFile {
  /** Le nom du fichier, qui sert de version : `0001_meteo.sql`. */
  readonly version: string;
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly version: string;
  readonly checksum: string;
}

export type MigrationPlan =
  | { readonly ok: true; readonly pending: readonly MigrationFile[] }
  | { readonly ok: false; readonly errors: readonly string[] };

const VERSION_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Compare les fichiers du dépôt à l'historique de la base et renvoie les
 * migrations à appliquer, dans l'ordre — ou toutes les raisons de refuser.
 */
export function planMigrations(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): MigrationPlan {
  const errors: string[] = [];
  const byVersion = new Map(files.map(file => [file.version, file]));

  for (const file of files) {
    if (!VERSION_PATTERN.test(file.version)) {
      errors.push(
        `${file.version} : nom invalide, attendu NNNN_description.sql.`,
      );
    }
  }

  for (const migration of applied) {
    const file = byVersion.get(migration.version);

    if (file === undefined) {
      errors.push(
        `${migration.version} : appliquée en base mais absente du dépôt.`,
      );
    } else if (file.checksum !== migration.checksum) {
      errors.push(
        `${migration.version} : modifiée après avoir été appliquée. Écrire une nouvelle migration plutôt que réécrire celle-ci.`,
      );
    }
  }

  const appliedVersions = new Set(applied.map(migration => migration.version));
  const sorted = [...files].sort((a, b) => a.version.localeCompare(b.version));
  const pending = sorted.filter(file => !appliedVersions.has(file.version));
  const lastApplied = [...appliedVersions]
    .sort((a, b) => a.localeCompare(b))
    .at(-1);

  if (lastApplied !== undefined) {
    for (const file of pending) {
      if (file.version < lastApplied) {
        errors.push(
          `${file.version} : plus ancienne que ${lastApplied}, déjà appliquée. Renuméroter après la dernière migration.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, pending };
}
