/**
 * L'alerte de gel en véranda (SPEC § 12.2 et § 12.8), en calcul pur.
 *
 * La chaîne : la prévision donne le minimum EXTÉRIEUR de la nuit ; le relevé
 * de 20 h donne l'avance de la véranda sur l'extérieur ; le modèle calibré en
 * déduit le minimum DANS la véranda ; la décision se prend sur la borne basse,
 * jamais sur l'estimation centrale — un chauffage inutile coûte quelques
 * centimes, un manqué coûte l'agrume.
 */

/**
 * Le modèle retenu à la calibration du 16/09/2026 (SPEC § 12.8) :
 *
 *   Δ_aube = 1,66 + 0,39 × Δ_soir + 0,32 × chute_extérieure
 *
 * un socle que l'abri procure toujours, 39 % de l'avance accumulée dans la
 * journée, et un tiers de ce que l'extérieur perd dans la nuit.
 */
export const VERANDA_MODEL = {
  base: 1.66,
  eveningLead: 0.39,
  exteriorDrop: 0.32,
  /** Deux écarts types de l'erreur hors échantillon (0,56 °C). */
  margin: 1.1,
  /** Les minima extérieurs sur lesquels le modèle a été ajusté. */
  validFrom: 0.3,
  validTo: 5,
} as const;

/**
 * Hors de son domaine, le modèle prolonge une droite : il doit le dire, dans
 * les deux sens — une nuit douce est aussi hors domaine qu'une nuit de gel.
 */
export type Extrapolation = "none" | "low" | "high";

export interface EveningInputs {
  /** Relevé extérieur de 20 h. */
  readonly exteriorAt20h: number;
  /** Relevé de la véranda à 20 h. */
  readonly verandaAt20h: number;
  /** Minimum extérieur annoncé pour la nuit. */
  readonly forecastExteriorMinimum: number;
}

export interface VerandaPrediction {
  readonly estimate: number;
  /** Marge du modèle, doublée en extrapolation. */
  readonly margin: number;
  readonly extrapolation: Extrapolation;
}

/**
 * Arrondi au dixième, sans « −0 » : `5,1 − 1,1 − 1 − 3` vaut −4e−16 en virgule
 * flottante, et s'afficherait « −0 °C ».
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

/** Le minimum de la véranda attendu cette nuit, avec sa marge. */
export function predictVerandaMinimum({
  exteriorAt20h,
  verandaAt20h,
  forecastExteriorMinimum,
}: EveningInputs): VerandaPrediction {
  const eveningLead = verandaAt20h - exteriorAt20h;
  const exteriorDrop = exteriorAt20h - forecastExteriorMinimum;
  const dawnLead =
    VERANDA_MODEL.base +
    VERANDA_MODEL.eveningLead * eveningLead +
    VERANDA_MODEL.exteriorDrop * exteriorDrop;

  const extrapolation: Extrapolation =
    forecastExteriorMinimum < VERANDA_MODEL.validFrom
      ? "low"
      : forecastExteriorMinimum > VERANDA_MODEL.validTo
        ? "high"
        : "none";

  return {
    estimate: round1(forecastExteriorMinimum + dawnLead),
    margin:
      extrapolation === "none"
        ? VERANDA_MODEL.margin
        : VERANDA_MODEL.margin * 2,
    extrapolation,
  };
}

export interface FrostDecisionInputs {
  readonly prediction: VerandaPrediction;
  /** Seuil de dégâts de la plante abritée la plus fragile (SPEC § 12.2). */
  readonly damageThreshold: number;
  /**
   * Erreur de la prévision extérieure, mesurée par le journal du soir
   * (protocole § 5 bis). Tant qu'elle n'est pas mesurée, c'est à l'appelant
   * de la fixer : aucune valeur par défaut ne ferait semblant de la connaître.
   */
  readonly forecastMargin: number;
  /**
   * Marge radiative : une feuille descend sous l'air par nuit claire. Bien plus
   * faible sous verre, mais gardée entière au démarrage (SPEC § 12.2).
   */
  readonly radiativeMargin: number;
}

export interface FrostDecision {
  readonly alert: boolean;
  /** Le pire cas retenu pour décider. */
  readonly lowerBound: number;
  readonly extrapolation: Extrapolation;
}

/**
 * Faut-il chauffer la véranda cette nuit ?
 *
 * Les marges s'additionnent : c'est l'hypothèse prudente tant qu'on ne sait
 * pas si les erreurs de prévision et de modèle sont indépendantes. Le seuil
 * est le seuil de DÉGÂTS, jamais celui de mort — alerter au seuil de mort,
 * c'est alerter trop tard.
 */
export function decideFrostAlert({
  prediction,
  damageThreshold,
  forecastMargin,
  radiativeMargin,
}: FrostDecisionInputs): FrostDecision {
  const lowerBound = round1(
    prediction.estimate - prediction.margin - forecastMargin - radiativeMargin,
  );

  return {
    alert: lowerBound <= damageThreshold,
    lowerBound,
    extrapolation: prediction.extrapolation,
  };
}

export interface MorningOutcome {
  readonly exteriorMinimum: number;
  readonly verandaMinimum: number;
}

export interface NightErrors {
  /** Minimum extérieur mesuré moins annoncé : la qualité de la prévision. */
  readonly forecastError: number;
  /**
   * Minimum de la véranda mesuré moins prédit AVEC le minimum extérieur
   * mesuré : la qualité du modèle seul, sans l'erreur de prévision.
   */
  readonly modelError: number;
}

/**
 * Les deux erreurs d'une nuit, séparées (SPEC § 12.8) : sans cette séparation,
 * on ne sait pas si une alerte ratée vient de la prévision ou du modèle.
 */
export function nightErrors(
  evening: EveningInputs,
  morning: MorningOutcome,
): NightErrors {
  const withMeasuredExterior = predictVerandaMinimum({
    ...evening,
    forecastExteriorMinimum: morning.exteriorMinimum,
  });

  return {
    forecastError: round1(
      morning.exteriorMinimum - evening.forecastExteriorMinimum,
    ),
    modelError: round1(morning.verandaMinimum - withMeasuredExterior.estimate),
  };
}
