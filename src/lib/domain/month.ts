/**
 * Les mois, en base 1 : janvier vaut 1.
 *
 * Le référentiel du jardin stocke les masques sous forme de tableaux dont la
 * position 0 est janvier. Faire coexister deux conventions dans le code est le
 * meilleur moyen de produire un décalage d'un mois qui ne se voit pas — on
 * expose donc **une seule** convention, humaine, et la conversion vers l'indice
 * de tableau se fait à un seul endroit (`month-mask.ts`).
 */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const MONTHS: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Initiales affichées sous une frise annuelle (brief de design § 6.1). */
export const MONTH_INITIALS: readonly string[] = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];

export const MONTH_NAMES: readonly string[] = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function isMonth(value: number): value is Month {
  return Number.isInteger(value) && value >= 1 && value <= 12;
}

export function monthName(month: Month): string {
  // `MONTH_NAMES` a douze entrées et `Month` est borné à 1..12, mais
  // `noUncheckedIndexedAccess` ne peut pas le savoir.
  /* c8 ignore next -- repli inatteignable : `Month` est borné à 1..12. */
  return MONTH_NAMES[month - 1] ?? "";
}

/**
 * Le mois suivant, en repassant de décembre à janvier.
 *
 * Indispensable : plusieurs périodes réelles traversent le nouvel an — la
 * plantation d'un rosier va d'octobre à mars.
 */
export function nextMonth(month: Month): Month {
  return month === 12 ? 1 : ((month + 1) as Month);
}
