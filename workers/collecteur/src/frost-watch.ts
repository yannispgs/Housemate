/**
 * Veille de gel en véranda (SPEC § 12.8) : ce qui se décide autour du calcul
 * pur de `src/lib/domain/frost.ts` — quelle prévision retenir, quel message
 * envoyer, et avec quels mots. Aucune entrée-sortie ici.
 */
import type {
  FrostDecision,
  VerandaPrediction,
} from "../../../src/lib/domain/frost";

/**
 * Les réglages du démarrage. Chacun est une décision, pas une mesure — la
 * mesure viendra du journal du soir (`meteo.nuits_gel`).
 */
export const VERANDA_WATCH = {
  /**
   * Seuil de dégâts du citronnier, la plante abritée la plus fragile (SPEC
   * § 12.2). Il viendra des fiches quand elles existeront ; d'ici là, c'est
   * le seul sujet hiverné en véranda.
   */
  damageThreshold: 0,
  /**
   * Erreur de la prévision extérieure : inconnue tant que le journal n'a pas
   * mesuré quelques nuits froides. Le protocole la situe entre 0,4 et 2 °C ;
   * on part du haut. Un modèle frileux coûte un chauffage inutile, un modèle
   * téméraire coûte l'agrume.
   */
  forecastMargin: 2,
  /**
   * Marge radiative, gardée entière au démarrage bien qu'elle soit faible sous
   * verre (SPEC § 12.2) : c'est un des premiers réglages à resserrer.
   */
  radiativeMargin: 3,
  /**
   * Sans relevé du soir, on ne peut pas décider. On le dit quand même si la
   * nuit peut être froide : un silence ne vaut pas « pas de gel ».
   */
  undecidedBelow: 5,
} as const;

export interface ModelMinimum {
  readonly source: string;
  readonly model: string;
  readonly minimum: number;
}

/** La note d'un modèle : son erreur sur les nuits passées (`fiabilite_modeles`). */
export interface ModelScore {
  readonly source: string;
  readonly model: string;
  readonly nights: number;
  readonly rmse: number;
}

/**
 * Les règles de la moyenne (SPEC § 12.8, décision du 29/09/2026). Chaque
 * modèle pèse l'inverse du carré de son erreur : deux fois plus précis, quatre
 * fois plus lourd.
 */
export const FORECAST_BLEND = {
  /** En deçà, un modèle n'est pas encore noté. */
  minNights: 5,
  /**
   * Plancher de l'erreur : aucun modèle n'est plus juste que le capteur qui le
   * juge (relevé horaire, minimum à l'heure près). Sans plancher, un modèle
   * chanceux sur quelques nuits écraserait tous les autres.
   */
  rmseFloor: 0.3,
  /** Au-delà de ce multiple de l'erreur du meilleur, un modèle est écarté. */
  excludeAbove: 2,
} as const;

export interface WeightedModel extends ModelMinimum {
  /** Part dans la moyenne, de 0 (écarté) à 1. */
  readonly weight: number;
}

export interface BlendedForecast {
  readonly minimum: number;
  /** Comment la moyenne a été faite, en clair : elle figure dans les mails. */
  readonly method: string;
  readonly models: readonly WeightedModel[];
}

const key = (entry: { source: string; model: string }) =>
  `${entry.source}/${entry.model}`;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Les poids bruts : 1 pour tous tant que rien n'est noté. */
function rawWeights(
  minima: readonly ModelMinimum[],
  scores: readonly ModelScore[],
): number[] {
  const rmse = new Map<string, number>();

  for (const score of scores) {
    if (score.nights >= FORECAST_BLEND.minNights) {
      rmse.set(key(score), Math.max(score.rmse, FORECAST_BLEND.rmseFloor));
    }
  }

  const known = minima.flatMap(entry => {
    const error = rmse.get(key(entry));

    return error === undefined ? [] : [error];
  });

  if (known.length === 0) {
    return minima.map(() => 1);
  }

  const best = Math.min(...known);
  const weightOf = (error: number) =>
    error > best * FORECAST_BLEND.excludeAbove ? 0 : 1 / error ** 2;
  // Un modèle arrivé récemment, pas encore noté, pèse comme un modèle moyen.
  const unscored = median(known.map(weightOf).filter(weight => weight > 0));

  return minima.map(entry => {
    const error = rmse.get(key(entry));

    return error === undefined ? unscored : weightOf(error);
  });
}

/**
 * Le minimum extérieur retenu pour la nuit : la moyenne des modèles, pondérée
 * par leur fiabilité, les moins fiables écartés.
 */
export function blendForecasts(
  minima: readonly ModelMinimum[],
  scores: readonly ModelScore[],
): BlendedForecast | null {
  if (minima.length === 0) {
    return null;
  }

  const raw = rawWeights(minima, scores);
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  const models = minima.map((entry, index) => ({
    ...entry,
    weight: (raw[index] ?? 0) / total,
  }));
  const minimum = models.reduce(
    (sum, entry) => sum + entry.weight * entry.minimum,
    0,
  );
  const kept = models.filter(entry => entry.weight > 0).length;
  const scored = minima.some(entry =>
    scores.some(
      score =>
        key(score) === key(entry) && score.nights >= FORECAST_BLEND.minNights,
    ),
  );

  return {
    minimum: Math.round(minimum * 10) / 10 + 0,
    method: scored
      ? `moyenne de ${kept} modèles sur ${models.length}, pondérée par leur fiabilité`
      : `moyenne simple de ${models.length} modèles, pas encore notés`,
    models,
  };
}

export type FrostMessage = "alerte" | "rappel" | "indisponible";

/**
 * Une alerte pleine ouvre l'épisode, puis un rappel léger chaque soir tant
 * qu'il dure (SPEC § 12.8 b) : la décision de chauffer se reprend tous les
 * soirs, mais cinq alertes pleines d'affilée finissent ignorées.
 */
export function messageFor(
  alert: boolean,
  previousNightAlerted: boolean,
): FrostMessage | null {
  if (!alert) {
    return null;
  }

  return previousNightAlerted ? "rappel" : "alerte";
}

const CELSIUS = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** « −2,5 °C », avec un vrai signe moins. */
export function celsius(value: number): string {
  return `${CELSIUS.format(value).replace("-", "−")} °C`;
}

/** Ce qu'un mail dit de la prévision retenue. */
export interface ForecastSummary {
  readonly minimum: number;
  readonly method: string;
}

export interface EveningFacts {
  readonly exteriorAt20h: number;
  readonly verandaAt20h: number;
  readonly forecast: ForecastSummary;
  readonly prediction: VerandaPrediction;
  readonly decision: FrostDecision;
}

export interface Mail {
  readonly subject: string;
  readonly text: string;
}

function extrapolationNote(decision: FrostDecision): string[] {
  if (decision.extrapolation !== "low") {
    return [];
  }

  return [
    "",
    "Le modèle de la véranda n'a encore jamais vu de gel : sa marge est doublée ce soir.",
  ];
}

/** Le texte d'une alerte ou d'un rappel. */
export function frostMail(
  kind: "alerte" | "rappel",
  facts: EveningFacts,
): Mail {
  const { prediction, decision, forecast } = facts;
  const figures = [
    `Minimum attendu dans la véranda : ${celsius(prediction.estimate)}`,
    `Pire cas retenu : ${celsius(decision.lowerBound)}, pour un seuil de dégâts du citronnier à ${celsius(VERANDA_WATCH.damageThreshold)}.`,
    "",
    `Dehors, la nuit descendra à ${celsius(forecast.minimum)} (${forecast.method}).`,
    `Relevés de 20 h : véranda ${celsius(facts.verandaAt20h)}, extérieur ${celsius(facts.exteriorAt20h)}.`,
    ...extrapolationNote(decision),
  ];

  if (kind === "rappel") {
    return {
      subject: "Véranda : chauffer encore cette nuit",
      text: ["L'épisode froid continue.", "", ...figures].join("\n"),
    };
  }

  return {
    subject: "Gel possible dans la véranda cette nuit : chauffer",
    text: [
      "Il peut geler cette nuit dans la véranda. Chauffer ce soir.",
      "",
      ...figures,
      "",
      "Tant que l'épisode dure, un rappel court arrivera chaque soir.",
    ].join("\n"),
  };
}

/** Le texte envoyé quand on n'a pas pu décider une nuit qui peut geler. */
export function undecidedMail(
  missing: readonly string[],
  forecast: ForecastSummary,
): Mail {
  return {
    subject: "Veille de gel impossible ce soir",
    text: [
      `Il manque ${missing.join(" et ")} : impossible d'estimer le minimum de la véranda.`,
      "",
      `Dehors, la nuit descendra à ${celsius(forecast.minimum)} (${forecast.method}).`,
      "Vérifier la véranda avant la nuit.",
    ].join("\n"),
  };
}
