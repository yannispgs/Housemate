import { isMonth, MONTHS, type Month, nextMonth } from "@/lib/domain/month";

/**
 * Masque de douze mois — la structure signature du produit.
 *
 * Une période n'est **pas** un couple début → fin mais douze booléens, un par
 * mois (SPEC § 11.4). C'est la forme qu'emploie déjà la source des données, et
 * elle est supérieure à l'intervalle sur trois points :
 *
 * - une période à cheval sur l'année (plantation, octobre → mars) ne demande
 *   aucun traitement particulier ;
 * - une période discontinue est exprimable — le citronnier fleurit toute
 *   l'année *sauf* en été, ce qu'un intervalle ne sait pas dire ;
 * - la source, le stockage et l'affichage partagent la même forme, donc la
 *   reprise se fait sans conversion et sans perte.
 *
 * L'indice 0 du tableau interne est janvier. C'est le seul endroit du code où
 * cette convention existe ; partout ailleurs on manipule des `Month` en base 1.
 */
export type MonthMask = readonly [
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
];

export const EMPTY_MASK: MonthMask = [
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
];

function build(predicate: (month: Month) => boolean): MonthMask {
  return MONTHS.map(predicate) as unknown as MonthMask;
}

/** Construit un masque à partir des mois concernés, dans n'importe quel ordre. */
export function maskOf(...months: readonly Month[]): MonthMask {
  const set = new Set<Month>(months);
  return build(month => set.has(month));
}

/**
 * Construit un masque à partir d'un intervalle **inclusif**, en traversant le
 * nouvel an si nécessaire : `maskFromRange(10, 3)` couvre octobre à mars.
 */
export function maskFromRange(from: Month, to: Month): MonthMask {
  const months: Month[] = [];
  let current = from;
  // Borné à douze itérations : un intervalle ne peut pas couvrir plus d'un an.
  for (let i = 0; i < 12; i += 1) {
    months.push(current);
    if (current === to) {
      break;
    }
    current = nextMonth(current);
  }
  return maskOf(...months);
}

export function isActiveIn(mask: MonthMask, month: Month): boolean {
  return mask[month - 1] ?? false;
}

export function activeMonths(mask: MonthMask): readonly Month[] {
  return MONTHS.filter(month => isActiveIn(mask, month));
}

export function countActive(mask: MonthMask): number {
  return activeMonths(mask).length;
}

export function isEmpty(mask: MonthMask): boolean {
  return countActive(mask) === 0;
}

export function isFullYear(mask: MonthMask): boolean {
  return countActive(mask) === 12;
}

/** Bascule un mois. C'est le geste de base de la frise, qui est l'éditeur. */
export function toggleMonth(mask: MonthMask, month: Month): MonthMask {
  return build(m => (m === month ? !isActiveIn(mask, m) : isActiveIn(mask, m)));
}

export function union(a: MonthMask, b: MonthMask): MonthMask {
  return build(month => isActiveIn(a, month) || isActiveIn(b, month));
}

export function intersection(a: MonthMask, b: MonthMask): MonthMask {
  return build(month => isActiveIn(a, month) && isActiveIn(b, month));
}

export function equals(a: MonthMask, b: MonthMask): boolean {
  return MONTHS.every(month => isActiveIn(a, month) === isActiveIn(b, month));
}

/**
 * Segments contigus, pour l'affichage.
 *
 * ⚠️ **Ne reboucle volontairement pas sur l'année.** Une frise est une bande
 * linéaire de janvier à décembre : une période d'octobre à mars s'y lit comme
 * **deux** segments visuels, `janvier–mars` et `octobre–décembre`. Les arrondir
 * comme un seul segment enjambant le bord serait faux à l'œil.
 *
 * Sert à poser les coins arrondis aux extrémités d'une séquence (brief § 5).
 */
export function segments(
  mask: MonthMask,
): readonly { readonly from: Month; readonly to: Month }[] {
  const result: { from: Month; to: Month }[] = [];
  let start: Month | null = null;

  for (const month of MONTHS) {
    const active = isActiveIn(mask, month);
    if (active && start === null) {
      start = month;
    }
    if (!active && start !== null) {
      result.push({ from: start, to: (month - 1) as Month });
      start = null;
    }
  }
  if (start !== null) {
    result.push({ from: start, to: 12 });
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Sérialisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Forme stockée dans `data/referentiel-jardin.json` : douze entiers 0 ou 1,
 * position 0 = janvier. On la conserve telle quelle — c'est ce qui fait que la
 * source, le stockage et l'affichage partagent la même forme.
 */
export type SerialisedMask = readonly number[];

export function toSerialised(mask: MonthMask): number[] {
  return MONTHS.map(month => (isActiveIn(mask, month) ? 1 : 0));
}

export class InvalidMaskError extends Error {}

export function fromSerialised(input: SerialisedMask): MonthMask {
  if (input.length !== 12) {
    throw new InvalidMaskError(
      `Un masque compte douze mois, ${input.length} reçu(s).`,
    );
  }
  for (const [index, value] of input.entries()) {
    if (value !== 0 && value !== 1) {
      const month = index + 1;
      if (!isMonth(month)) {
        throw new InvalidMaskError(`Mois hors bornes : ${month}.`);
      }
      throw new InvalidMaskError(
        `Valeur ${value} au mois ${month} : seuls 0 et 1 sont admis.`,
      );
    }
  }
  return build(month => input[month - 1] === 1);
}
