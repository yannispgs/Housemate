import { isMonth, type Month } from "@/lib/domain/month";

/**
 * Une date civile : une année, un mois, un jour. **Ni heure, ni fuseau.**
 *
 * Tout le domaine des échéances raisonne en jours, pas en instants. « Fait
 * mardi » désigne le mardi vécu, et « fin de garantie le 12 mars 2027 » n'a pas
 * d'heure. Manipuler des `Date` ici importerait le décalage UTC pour rien : un
 * `toISOString()` sur une date du soir imprime le jour suivant, et l'erreur ne
 * se voit qu'une fois sur deux (conventions § 12).
 *
 * Les instants existent ailleurs — les relevés de capteurs, l'horodatage des
 * prévisions — mais pas ici.
 */
export type PlainDate = {
  readonly year: number;
  readonly month: Month;
  readonly day: number;
};

export class InvalidDateError extends Error {}

const DAYS_IN_MONTH: readonly number[] = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: Month): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  /* c8 ignore next -- repli inatteignable : `Month` est borné à 1..12. */
  return DAYS_IN_MONTH[month - 1] ?? 30;
}

export function plainDate(year: number, month: number, day: number): PlainDate {
  if (!Number.isInteger(year)) {
    throw new InvalidDateError(`Année invalide : ${year}.`);
  }
  if (!isMonth(month)) {
    throw new InvalidDateError(`Mois invalide : ${month}.`);
  }
  const max = daysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > max) {
    throw new InvalidDateError(
      `Jour invalide : ${day}. ${month}/${year} compte ${max} jours.`,
    );
  }
  return { year, month, day };
}

/* -------------------------------------------------------------------------- */
/* Comparaison                                                                */
/* -------------------------------------------------------------------------- */

/** Négatif si `a` précède `b`, zéro s'ils désignent le même jour. */
export function compare(a: PlainDate, b: PlainDate): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  if (a.month !== b.month) {
    return a.month - b.month;
  }
  return a.day - b.day;
}

export function isBefore(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) < 0;
}

export function isAfter(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) > 0;
}

export function isSameDay(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) === 0;
}

/* -------------------------------------------------------------------------- */
/* Arithmétique                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Nombre de jours depuis une époque arbitraire. Sert de représentation
 * intermédiaire pour l'arithmétique en jours et pour les différences.
 * Algorithme de Howard Hinnant, valable pour toute année grégorienne.
 */
function toDayNumber(date: PlainDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const m = date.month;
  const doy =
    Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNumber(dayNumber: number): PlainDate {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return plainDate(month <= 2 ? y + 1 : y, month, day);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Nombre de jours de `from` à `to` : positif si `to` est postérieur. */
export function daysBetween(from: PlainDate, to: PlainDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * Ajoute des mois, en **rabattant** sur le dernier jour du mois cible quand le
 * jour n'existe pas : 31 janvier + 1 mois donne le 28 ou 29 février.
 *
 * ⚠️ Le rabattement perd de l'information. Pour une série récurrente, ne jamais
 * enchaîner les ajouts — voir `addMonthsFromAnchor`.
 */
export function addMonths(date: PlainDate, months: number): PlainDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const monthIndex = total - year * 12;
  const month = (monthIndex + 1) as Month;
  const day = Math.min(date.day, daysInMonth(year, month));
  return plainDate(year, month, day);
}

export function addYears(date: PlainDate, years: number): PlainDate {
  return addMonths(date, years * 12);
}

/**
 * La n-ième échéance d'une série mensuelle, **toujours calculée depuis
 * l'ancre** et jamais de proche en proche.
 *
 * C'est la différence entre une série juste et une série qui dérive. Prenons
 * « tous les trois mois à partir du 31 janvier » :
 *
 * - de proche en proche : 31 jan → 30 avr (rabattu) → 30 juil → 30 oct.
 *   Le rabattement d'avril contamine tout le reste et on a perdu le 31.
 * - depuis l'ancre : 31 jan → 30 avr → **31** juil → 31 oct.
 *   Chaque échéance retrouve l'intention d'origine.
 *
 * Le rabattement doit rester une conséquence locale du mois traversé, jamais
 * une perte définitive.
 */
export function addMonthsFromAnchor(
  anchor: PlainDate,
  months: number,
  occurrence: number,
): PlainDate {
  return addMonths(anchor, months * occurrence);
}

/* -------------------------------------------------------------------------- */
/* Sérialisation                                                              */
/* -------------------------------------------------------------------------- */

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Format ISO `AAAA-MM-JJ`, sans heure — donc sans ambiguïté de fuseau. */
export function toISO(date: PlainDate): string {
  return `${date.year.toString().padStart(4, "0")}-${pad(date.month)}-${pad(date.day)}`;
}

export function fromISO(input: string): PlainDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) {
    throw new InvalidDateError(
      `Date attendue au format AAAA-MM-JJ, reçu « ${input} ».`,
    );
  }
  const [, year, month, day] = match;
  return plainDate(Number(year), Number(month), Number(day));
}

/**
 * Le jour civil **local** correspondant à un instant.
 *
 * Volontairement construit à partir des accesseurs locaux et non de
 * `toISOString()` : le serveur tourne en UTC, donc une complétion enregistrée à
 * 23 h heure française serait filée au lendemain.
 */
export function localDay(instant: Date): PlainDate {
  return plainDate(
    instant.getFullYear(),
    instant.getMonth() + 1,
    instant.getDate(),
  );
}
