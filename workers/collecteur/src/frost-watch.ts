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

/**
 * Le minimum retenu : le plus froid de tous les modèles. Tant que le banc
 * d'essai n'a pas dit lequel croire, le pire cas est le seul choix qui ne
 * parie pas sur l'agrume.
 */
export function coldestForecast(
  minima: readonly ModelMinimum[],
): ModelMinimum | null {
  let coldest: ModelMinimum | null = null;

  for (const candidate of minima) {
    if (coldest === null || candidate.minimum < coldest.minimum) {
      coldest = candidate;
    }
  }

  return coldest;
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

export interface EveningFacts {
  readonly exteriorAt20h: number;
  readonly verandaAt20h: number;
  readonly forecast: ModelMinimum;
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
    `Dehors, la nuit descendra à ${celsius(forecast.minimum)} (${forecast.model}, le plus froid des modèles).`,
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
  forecast: ModelMinimum,
): Mail {
  return {
    subject: "Veille de gel impossible ce soir",
    text: [
      `Il manque ${missing.join(" et ")} : impossible d'estimer le minimum de la véranda.`,
      "",
      `Dehors, la nuit descendra à ${celsius(forecast.minimum)} (${forecast.model}).`,
      "Vérifier la véranda avant la nuit.",
    ].join("\n"),
  };
}
