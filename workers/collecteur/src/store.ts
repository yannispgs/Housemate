/**
 * Écriture des relevés et des prévisions.
 *
 * Écrit contre une signature minimale de requête « gabarit », que partagent le
 * pilote HTTP de Neon (dans le Worker) et `postgres` (dans les tests, contre la
 * base locale) : le même SQL est donc exécuté dans les deux cas.
 *
 * `on conflict do nothing` rend chaque écriture rejouable : un déclenchement
 * doublé par Cloudflare, ou une reprise après erreur, ne crée pas de doublon.
 */

export type Sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

export interface Reading {
  readonly sensor: "exterieur" | "veranda";
  readonly at: Date;
  readonly temperature: number;
  readonly humidity: number | null;
}

export async function insertReadings(
  sql: Sql,
  readings: readonly Reading[],
): Promise<void> {
  if (readings.length === 0) {
    return;
  }

  await sql`
    insert into meteo.releves (capteur, instant, temperature, humidite, origine)
    select capteur, instant, temperature, humidite, 'api'
    from unnest(
      ${readings.map(reading => reading.sensor)}::text[],
      ${readings.map(reading => reading.at.toISOString())}::timestamptz[],
      ${readings.map(reading => reading.temperature)}::numeric[],
      ${readings.map(reading => reading.humidity)}::smallint[]
    ) as r(capteur, instant, temperature, humidite)
    on conflict do nothing
  `;
}

export interface StoredForecast {
  readonly source: string;
  readonly model: string;
  readonly issuedAt: Date | null;
  readonly target: Date;
  readonly temperature: number;
}

export async function insertForecasts(
  sql: Sql,
  retrievedAt: Date,
  forecasts: readonly StoredForecast[],
): Promise<void> {
  if (forecasts.length === 0) {
    return;
  }

  await sql`
    insert into meteo.previsions
      (source, modele, recuperee_le, emise_le, cible, temperature)
    select source, modele, ${retrievedAt.toISOString()}::timestamptz,
      emise_le, cible, temperature
    from unnest(
      ${forecasts.map(forecast => forecast.source)}::text[],
      ${forecasts.map(forecast => forecast.model)}::text[],
      ${forecasts.map(forecast => forecast.issuedAt?.toISOString() ?? null)}::timestamptz[],
      ${forecasts.map(forecast => forecast.target.toISOString())}::timestamptz[],
      ${forecasts.map(forecast => forecast.temperature)}::numeric[]
    ) as f(source, modele, emise_le, cible, temperature)
    on conflict do nothing
  `;
}

export interface StoredRain {
  readonly source: string;
  readonly model: string;
  readonly issuedAt: Date | null;
  readonly start: Date;
  readonly end: Date;
  readonly millimetres: number;
}

export async function insertRainForecasts(
  sql: Sql,
  retrievedAt: Date,
  rain: readonly StoredRain[],
): Promise<void> {
  if (rain.length === 0) {
    return;
  }

  await sql`
    insert into meteo.previsions_pluie
      (source, modele, recuperee_le, emise_le, debut, fin, precipitation_mm)
    select source, modele, ${retrievedAt.toISOString()}::timestamptz,
      emise_le, debut, fin, precipitation_mm
    from unnest(
      ${rain.map(point => point.source)}::text[],
      ${rain.map(point => point.model)}::text[],
      ${rain.map(point => point.issuedAt?.toISOString() ?? null)}::timestamptz[],
      ${rain.map(point => point.start.toISOString())}::timestamptz[],
      ${rain.map(point => point.end.toISOString())}::timestamptz[],
      ${rain.map(point => point.millimetres)}::numeric[]
    ) as p(source, modele, emise_le, debut, fin, precipitation_mm)
    on conflict do nothing
  `;
}
