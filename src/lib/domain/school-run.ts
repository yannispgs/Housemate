import { compare, type PlainDate, plainDate } from "@/lib/domain/plain-date";

/**
 * Qui emmène l'enfant à la crèche, décidé par la pluie (SPEC § 12.9).
 *
 * Quand il fait sec sur le créneau du trajet, c'est un parent ; quand il pleut,
 * c'est l'autre. Le rappel part la veille au soir, sur les prévisions de tous
 * les modèles : leur accord tranche, leur désaccord est un doute.
 *
 * ⚠️ Aucun prénom ici : le dépôt est public. Le verdict dit « sec », « pluie »
 * ou « doute » ; qui cela désigne vient de la configuration du foyer.
 */

/** 1 = lundi … 7 = dimanche (ISO 8601). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Tous les réglages du rappel. Ce sont des DONNÉES, modifiables dans l'app —
 * jamais des constantes du code (demande du foyer).
 */
export interface SchoolRunSettings {
  readonly weekdays: readonly Weekday[];
  /** Créneau du trajet, en heures de Paris : de `fromHour` à `toHour`. */
  readonly fromHour: number;
  readonly toHour: number;
  /** En dessous : sec. */
  readonly dryBelowMm: number;
  /** À partir de : pluie. Entre les deux : doute. */
  readonly rainFromMm: number;
}

/** Les jours sans crèche : vacances connues d'avance, et exceptions. */
export interface SchoolRunCalendar {
  readonly closures: readonly { from: PlainDate; to: PlainDate }[];
  /** Un jour habituel où on ne l'emmène pas. */
  readonly skippedDays: readonly PlainDate[];
  /** Un jour inhabituel où on l'emmène quand même. */
  readonly extraDays: readonly PlainDate[];
}

/** Réglages décidés le 28/09/2026 : lundi, mardi, jeudi, vendredi, 8 h – 9 h. */
export const DEFAULT_SCHOOL_RUN: SchoolRunSettings = {
  weekdays: [1, 2, 4, 5],
  fromHour: 8,
  toHour: 9,
  dryBelowMm: 1,
  rainFromMm: 2,
};

function isoWeekday(date: PlainDate): Weekday {
  // Midi UTC : aucune heure d'été ne peut faire basculer le jour.
  const day = new Date(
    Date.UTC(date.year, date.month - 1, date.day, 12),
  ).getUTCDay();

  return (day === 0 ? 7 : day) as Weekday;
}

function sameDay(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) === 0;
}

/** Y a-t-il crèche ce jour-là ? */
export function isSchoolDay(
  date: PlainDate,
  settings: SchoolRunSettings,
  calendar: SchoolRunCalendar,
): boolean {
  if (calendar.extraDays.some(day => sameDay(day, date))) {
    return true;
  }

  if (calendar.skippedDays.some(day => sameDay(day, date))) {
    return false;
  }

  const closed = calendar.closures.some(
    ({ from, to }) => compare(from, date) <= 0 && compare(date, to) <= 0,
  );

  return !closed && settings.weekdays.includes(isoWeekday(date));
}

const PARIS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * Le jour et l'heure de Paris d'un instant. Explicite, et non `localDay` : un
 * Worker Cloudflare tourne en UTC, où minuit et une heure du matin à Paris
 * tombent encore la veille.
 */
function parisDayAndHour(instant: Date): { day: PlainDate; hour: number } {
  const parts = Object.fromEntries(
    PARIS.formatToParts(instant).map(part => [part.type, part.value]),
  );

  return {
    day: plainDate(Number(parts.year), Number(parts.month), Number(parts.day)),
    hour: Number(parts.hour),
  };
}

/** Un cumul de pluie prévu par un modèle, sur une heure. */
export interface RainHour {
  readonly model: string;
  readonly start: Date;
  readonly millimetres: number;
}

/**
 * Le cumul de chaque modèle sur le créneau du jour donné.
 *
 * Un modèle qui ne couvre pas TOUTES les heures du créneau est écarté plutôt
 * que compté à moitié : sommer une seule heure sur deux ferait paraître la
 * matinée plus sèche qu'annoncé.
 */
export function rainOverWindow(
  hours: readonly RainHour[],
  day: PlainDate,
  settings: SchoolRunSettings,
): ReadonlyMap<string, number> {
  const needed = settings.toHour - settings.fromHour;
  const perModel = new Map<string, { total: number; hours: Set<number> }>();

  for (const hour of hours) {
    const local = parisDayAndHour(hour.start);

    if (
      !sameDay(local.day, day) ||
      local.hour < settings.fromHour ||
      local.hour >= settings.toHour
    ) {
      continue;
    }

    const entry = perModel.get(hour.model) ?? { total: 0, hours: new Set() };
    entry.total += hour.millimetres;
    entry.hours.add(local.hour);
    perModel.set(hour.model, entry);
  }

  const totals = new Map<string, number>();

  for (const [model, { total, hours: covered }] of perModel) {
    if (covered.size === needed) {
      totals.set(model, Math.round(total * 10) / 10);
    }
  }

  return totals;
}

export type RainVerdict = "dry" | "rain" | "doubt";

export interface SchoolRunDecision {
  readonly verdict: RainVerdict;
  /** Le verdict de chaque modèle, pour le message et pour la comparaison. */
  readonly byModel: ReadonlyMap<string, RainVerdict>;
}

function classify(
  millimetres: number,
  settings: SchoolRunSettings,
): RainVerdict {
  if (millimetres < settings.dryBelowMm) {
    return "dry";
  }

  if (millimetres >= settings.rainFromMm) {
    return "rain";
  }

  return "doubt";
}

/**
 * Le verdict : tous les modèles d'accord, ou doute.
 *
 * Le doute est le verdict sûr, parce que les erreurs ne coûtent pas pareil :
 * se lever pour rien coûte un réveil, ne pas se lever alors qu'il pleut laisse
 * l'autre parent sous la pluie avec l'enfant. Sans aucune prévision, c'est
 * donc aussi un doute.
 */
export function decideSchoolRun(
  totals: ReadonlyMap<string, number>,
  settings: SchoolRunSettings,
): SchoolRunDecision {
  const byModel = new Map<string, RainVerdict>();

  for (const [model, millimetres] of totals) {
    byModel.set(model, classify(millimetres, settings));
  }

  const verdicts = new Set(byModel.values());
  const [only] = verdicts;

  return {
    verdict: verdicts.size === 1 && only !== undefined ? only : "doubt",
    byModel,
  };
}
