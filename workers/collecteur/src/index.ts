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
  parseMetNorwayRain,
  parseOpenMeteo,
  parseOpenMeteoRain,
  type RainPoint,
} from "./forecasts";
import {
  parisHour,
  shouldFetchRainForecasts,
  shouldFetchTemperatureForecasts,
  shouldReadSensors,
} from "./schedule";
import {
  insertForecasts,
  insertRainForecasts,
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

/**
 * Chaque source échoue seule : on enregistre ce qui est arrivé, PUIS on fait
 * échouer l'exécution, pour qu'une source muette se voie dans les journaux du
 * Worker au lieu de passer inaperçue.
 */
async function storeThenReport<T>(
  sources: Promise<T[]>[],
  store: (points: T[]) => Promise<void>,
): Promise<void> {
  const results = await Promise.allSettled(sources);

  await store(
    results.flatMap(result =>
      result.status === "fulfilled" ? result.value : [],
    ),
  );

  const failures = results.filter(result => result.status === "rejected");

  if (failures.length > 0) {
    throw new Error(
      `Prévisions manquantes — ${failures.map(failure => String(failure.reason)).join(" ; ")}`,
    );
  }
}

function coordinates(env: Env): Coordinates {
  return { latitude: Number(env.LATITUDE), longitude: Number(env.LONGITUDE) };
}

const MET_NORWAY_HEADERS = { headers: { "User-Agent": MET_NORWAY_USER_AGENT } };

async function collectTemperatureForecasts(env: Env, sql: Sql): Promise<void> {
  const where = coordinates(env);
  const retrievedAt = new Date();
  await storeThenReport<ForecastPoint>(
    [
      fetchJson(openMeteoUrl(where, "temperature_2m")).then(parseOpenMeteo),
      fetchJson(metNorwayUrl(where), MET_NORWAY_HEADERS).then(payload =>
        parseMetNorway(payload, retrievedAt),
      ),
    ],
    points => insertForecasts(sql, retrievedAt, points),
  );
}

async function collectRainForecasts(env: Env, sql: Sql): Promise<void> {
  const where = coordinates(env);
  const retrievedAt = new Date();
  await storeThenReport<RainPoint>(
    [
      fetchJson(openMeteoUrl(where, "precipitation")).then(parseOpenMeteoRain),
      fetchJson(metNorwayUrl(where), MET_NORWAY_HEADERS).then(payload =>
        parseMetNorwayRain(payload, retrievedAt),
      ),
    ],
    points => insertRainForecasts(sql, retrievedAt, points),
  );
}

export default {
  async scheduled(controller, env) {
    const hour = parisHour(new Date(controller.scheduledTime));
    const sql = neon(env.DATABASE_URL) as unknown as Sql;
    const tasks: Promise<void>[] = [];

    if (shouldReadSensors(hour)) {
      tasks.push(collectReadings(env, sql));
    }

    if (shouldFetchTemperatureForecasts(hour)) {
      tasks.push(collectTemperatureForecasts(env, sql));
    }

    if (shouldFetchRainForecasts(hour)) {
      tasks.push(collectRainForecasts(env, sql));
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
