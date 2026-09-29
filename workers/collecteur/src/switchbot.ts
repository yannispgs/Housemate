/**
 * API Cloud SwitchBot v1.1 : signature des requêtes et lecture d'un capteur.
 *
 * Chaque requête porte une signature HMAC-SHA256 de `token + t + nonce`, clé =
 * le secret de l'app SwitchBot. WebCrypto plutôt que `node:crypto` : le même
 * code tourne dans le Worker et dans les tests.
 */

export const SWITCHBOT_API = "https://api.switch-bot.com/v1.1";

export interface SwitchBotCredentials {
  readonly token: string;
  readonly secret: string;
}

export interface MeterReading {
  readonly temperature: number;
  readonly humidity: number | null;
}

export class SwitchBotError extends Error {}

/** Les en-têtes signés d'une requête, pour cet instant et ce nonce. */
export async function signedHeaders(
  { token, secret }: SwitchBotCredentials,
  timestamp: number,
  nonce: string,
): Promise<Record<string, string>> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${token}${timestamp}${nonce}`),
  );
  const sign = btoa(String.fromCodePoint(...new Uint8Array(signature)));

  return {
    Authorization: token,
    sign,
    t: String(timestamp),
    nonce,
  };
}

/**
 * Extrait la mesure de la réponse `GET /devices/{id}/status`.
 *
 * ⚠️ SwitchBot répond HTTP 200 même en cas d'échec : le vrai statut est
 * `statusCode` dans le corps (100 = succès). Un appareil hors ligne revient
 * avec un autre code, et c'est une donnée manquante, pas une température.
 */
export function parseMeterStatus(payload: unknown): MeterReading {
  const response = payload as {
    statusCode?: unknown;
    message?: unknown;
    body?: { temperature?: unknown; humidity?: unknown };
  };

  if (response.statusCode !== 100) {
    throw new SwitchBotError(
      `SwitchBot a répondu ${String(response.statusCode)} : ${String(response.message)}.`,
    );
  }

  const temperature = response.body?.temperature;
  const humidity = response.body?.humidity;

  if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
    throw new SwitchBotError("Réponse SwitchBot sans température.");
  }

  return {
    temperature,
    humidity:
      typeof humidity === "number" && humidity >= 0 && humidity <= 100
        ? humidity
        : null,
  };
}

/* c8 ignore start -- appel réseau seul : la signature et la lecture sont
   testées à part, l'ensemble est vérifié par l'essai réel du collecteur. */
/** Lit un capteur maintenant. */
export async function readMeter(
  credentials: SwitchBotCredentials,
  deviceId: string,
): Promise<MeterReading> {
  const headers = await signedHeaders(
    credentials,
    Date.now(),
    crypto.randomUUID(),
  );
  const response = await fetch(
    `${SWITCHBOT_API}/devices/${encodeURIComponent(deviceId)}/status`,
    { headers },
  );

  if (!response.ok) {
    throw new SwitchBotError(`SwitchBot : HTTP ${response.status}.`);
  }

  return parseMeterStatus(await response.json());
}
/* c8 ignore stop */
