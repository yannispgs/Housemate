/**
 * Collecteur météo — Cloudflare Worker déclenché chaque heure (SPEC § 12.7).
 *
 * Toute la configuration est secrète (`wrangler secret put`) : les coordonnées
 * du foyer et les identifiants matériels des capteurs ne doivent pas figurer
 * dans un dépôt public.
 */
import { neon } from "@neondatabase/serverless";
import {
  type Coordinates,
  type ForecastPoint,
  MET_NORWAY_USER_AGENT,
  metNorwayUrl,
  openMeteoUrl,
  parseMetNorway,
  parseOpenMeteo,
} from "./forecasts";
import { parisHour, shouldFetchForecasts, shouldReadSensors } from "./schedule";
import {
  insertForecasts,
  insertReadings,
  type Reading,
  type Sql,
} from "./store";
import { readMeter } from "./switchbot";

interface Env {
  /** Rôle `collecteur` (membre de `meteo_ecriture`), connexion avec pool. */
  DATABASE_URL: string;
  SWITCHBOT_TOKEN: string;
  SWITCHBOT_SECRET: string;
  SENSOR_EXTERIOR_ID: string;
  SENSOR_VERANDA_ID: string;
  LATITUDE: string;
  LONGITUDE: string;
}

async function collectReadings(env: Env, sql: Sql): Promise<void> {
  const credentials = {
    token: env.SWITCHBOT_TOKEN,
    secret: env.SWITCHBOT_SECRET,
  };
  const sensors = [
    ["exterieur", env.SENSOR_EXTERIOR_ID],
    ["veranda", env.SENSOR_VERANDA_ID],
  ] as const;
  const readings: Reading[] = [];
  const failures: string[] = [];

  // Un capteur hors ligne ne doit pas faire perdre la mesure de l'autre.
  for (const [sensor, deviceId] of sensors) {
    try {
      const { temperature, humidity } = await readMeter(credentials, deviceId);
      readings.push({ sensor, at: new Date(), temperature, humidity });
    } catch (error) {
      failures.push(`${sensor} : ${String(error)}`);
    }
  }

  await insertReadings(sql, readings);

  if (failures.length > 0) {
    throw new Error(`Relevés manquants — ${failures.join(" ; ")}`);
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${new URL(url).host} : HTTP ${response.status}.`);
  }

  return response.json();
}

async function collectForecasts(env: Env, sql: Sql): Promise<void> {
  const where: Coordinates = {
    latitude: Number(env.LATITUDE),
    longitude: Number(env.LONGITUDE),
  };
  const retrievedAt = new Date();
  const sources: Promise<ForecastPoint[]>[] = [
    fetchJson(openMeteoUrl(where)).then(parseOpenMeteo),
    fetchJson(metNorwayUrl(where), {
      headers: { "User-Agent": MET_NORWAY_USER_AGENT },
    }).then(payload => parseMetNorway(payload, retrievedAt)),
  ];
  const results = await Promise.allSettled(sources);
  const points = results.flatMap(result =>
    result.status === "fulfilled" ? result.value : [],
  );

  await insertForecasts(sql, retrievedAt, points);

  const failures = results.filter(result => result.status === "rejected");

  if (failures.length > 0) {
    throw new Error(
      `Prévisions manquantes — ${failures.map(failure => String(failure.reason)).join(" ; ")}`,
    );
  }
}

export default {
  async scheduled(controller, env) {
    const hour = parisHour(new Date(controller.scheduledTime));
    const sql = neon(env.DATABASE_URL) as unknown as Sql;
    const tasks: Promise<void>[] = [];

    if (shouldReadSensors(hour)) {
      tasks.push(collectReadings(env, sql));
    }

    if (shouldFetchForecasts(hour)) {
      tasks.push(collectForecasts(env, sql));
    }

    // Les deux tâches vont au bout même si l'une échoue ; l'échec est ensuite
    // relancé pour apparaître dans les journaux du Worker.
    const results = await Promise.allSettled(tasks);
    const failure = results.find(result => result.status === "rejected");

    if (failure) {
      throw failure.reason;
    }
  },
} satisfies ExportedHandler<Env>;
