/**
 * Les trois temps de la veille de gel (SPEC § 12.8) :
 *
 * - 20 h : évaluer la nuit et l'inscrire au journal ;
 * - 20 h à 23 h : envoyer le message de la nuit s'il n'est pas parti — un
 *   relais indisponible à 20 h est ainsi retenté trois fois avant la nuit ;
 * - 9 h : faire le bilan, avec les minima réellement mesurés.
 *
 * L'envoi relit la ligne du journal plutôt que de recevoir la décision : le
 * journal est la seule vérité, et ce qui part est exactement ce qui y est écrit.
 */
import {
  decideFrostAlert,
  nightErrors,
  predictVerandaMinimum,
} from "../../../src/lib/domain/frost";
import {
  claimMessage,
  eveningReadings,
  forecastMinima,
  nightToReview,
  type PendingMessage,
  previousNightAlerted,
  recordEvening,
  recordReview,
  releaseMessage,
} from "./frost-store";
import {
  coldestForecast,
  frostMail,
  type Mail,
  messageFor,
  undecidedMail,
  VERANDA_WATCH,
} from "./frost-watch";
import type { Sql } from "./store";

export async function evaluateEvening(
  sql: Sql,
  night: string,
  now: Date,
): Promise<void> {
  const readings = await eveningReadings(sql, now);
  const forecast = coldestForecast(await forecastMinima(sql, night, now));

  if (forecast === null) {
    // Sans prévision, rien à décider ni à dire de sensé : l'échec doit se
    // voir dans les journaux du Worker, pas passer pour une nuit douce.
    throw new Error(
      `Veille de gel du ${night} : aucune prévision pour la nuit.`,
    );
  }

  const common = {
    night,
    exteriorAt20h: readings.exterieur,
    verandaAt20h: readings.veranda,
    forecastMinimum: forecast.minimum,
    forecastModel: `${forecast.source}/${forecast.model}`,
    damageThreshold: VERANDA_WATCH.damageThreshold,
  };

  if (readings.exterieur === null || readings.veranda === null) {
    await recordEvening(sql, {
      ...common,
      estimate: null,
      modelMargin: null,
      forecastMargin: null,
      radiativeMargin: null,
      lowerBound: null,
      extrapolation: null,
      alert: false,
      message:
        forecast.minimum <= VERANDA_WATCH.undecidedBelow
          ? "indisponible"
          : null,
    });

    return;
  }

  const prediction = predictVerandaMinimum({
    exteriorAt20h: readings.exterieur,
    verandaAt20h: readings.veranda,
    forecastExteriorMinimum: forecast.minimum,
  });
  const decision = decideFrostAlert({
    prediction,
    damageThreshold: VERANDA_WATCH.damageThreshold,
    forecastMargin: VERANDA_WATCH.forecastMargin,
    radiativeMargin: VERANDA_WATCH.radiativeMargin,
  });
  const previous = await previousNightAlerted(sql, night);

  await recordEvening(sql, {
    ...common,
    estimate: prediction.estimate,
    modelMargin: prediction.margin,
    forecastMargin: VERANDA_WATCH.forecastMargin,
    radiativeMargin: VERANDA_WATCH.radiativeMargin,
    lowerBound: decision.lowerBound,
    extrapolation: decision.extrapolation,
    alert: decision.alert,
    message: messageFor(decision.alert, previous),
  });
}

function missingSensors(pending: PendingMessage): string[] {
  const missing: string[] = [];

  if (pending.verandaAt20h === null) {
    missing.push("le relevé de la véranda");
  }

  if (pending.exteriorAt20h === null) {
    missing.push("le relevé extérieur");
  }

  return missing;
}

/** Le mail d'une ligne du journal. */
export function mailFor(pending: PendingMessage): Mail {
  const forecast = {
    source: "",
    model: pending.forecastModel,
    minimum: pending.forecastMinimum,
  };

  if (
    pending.message === "indisponible" ||
    pending.exteriorAt20h === null ||
    pending.verandaAt20h === null ||
    pending.estimate === null ||
    pending.modelMargin === null ||
    pending.lowerBound === null ||
    pending.extrapolation === null
  ) {
    return undecidedMail(missingSensors(pending), forecast);
  }

  return frostMail(pending.message, {
    exteriorAt20h: pending.exteriorAt20h,
    verandaAt20h: pending.verandaAt20h,
    forecast,
    prediction: {
      estimate: pending.estimate,
      margin: pending.modelMargin,
      extrapolation: pending.extrapolation,
    },
    decision: {
      alert: true,
      lowerBound: pending.lowerBound,
      extrapolation: pending.extrapolation,
    },
  });
}

/** Envoie le message de la nuit s'il reste à partir. */
export async function sendPending(
  sql: Sql,
  night: string,
  send: (mail: Mail) => Promise<void>,
): Promise<void> {
  const pending = await claimMessage(sql, night);

  if (pending === null) {
    return;
  }

  try {
    await send(mailFor(pending));
  } catch (error) {
    await releaseMessage(sql, night);
    throw error;
  }
}

/** Le bilan du matin : les deux erreurs de la nuit, séparées. */
export async function reviewNight(sql: Sql, night: string): Promise<void> {
  const entry = await nightToReview(sql, night);

  if (entry?.minExterior == null || entry.minVeranda === null) {
    return;
  }

  const errors = nightErrors(
    {
      exteriorAt20h: entry.exteriorAt20h,
      verandaAt20h: entry.verandaAt20h,
      forecastExteriorMinimum: entry.forecastMinimum,
    },
    {
      exteriorMinimum: entry.minExterior,
      verandaMinimum: entry.minVeranda,
    },
  );

  await recordReview(sql, night, {
    minExterior: entry.minExterior,
    minVeranda: entry.minVeranda,
    ...errors,
  });
}
