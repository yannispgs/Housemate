import { describe, expect, it } from "vitest";
import {
  activeMonths,
  countActive,
  EMPTY_MASK,
  equals,
  fromSerialised,
  InvalidMaskError,
  intersection,
  isActiveIn,
  isEmpty,
  isFullYear,
  maskFromRange,
  maskOf,
  segments,
  toggleMonth,
  toSerialised,
  union,
} from "@/lib/domain/month-mask";

/*
 * Les deux cas structurants viennent du référentiel réel du jardin
 * (`data/referentiel-jardin.json`). La SPEC § 11.4 et le brief de design § 8
 * demandent expressément de ne pas les « corriger » : ce sont eux qui
 * justifient le masque plutôt qu'un intervalle.
 */

/** Rosier — plantation d'octobre à mars, à cheval sur le nouvel an. */
const PLANTATION_ROSIER = fromSerialised([1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1]);

/** Citronnier — fleurit toute l'année SAUF en été : un trou au milieu. */
const FLORAISON_CITRONNIER = fromSerialised([
  1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1,
]);

describe("construction", () => {
  it("maskOf ignore l'ordre et les doublons", () => {
    expect(equals(maskOf(3, 1, 3), maskOf(1, 3))).toBe(true);
  });

  it("maskFromRange couvre un intervalle inclusif", () => {
    expect(activeMonths(maskFromRange(4, 6))).toEqual([4, 5, 6]);
  });

  it("maskFromRange traverse le nouvel an", () => {
    // Le cas d'école : plantation du rosier, octobre → mars.
    expect(equals(maskFromRange(10, 3), PLANTATION_ROSIER)).toBe(true);
  });

  it("maskFromRange sur un seul mois ne retient que lui", () => {
    expect(activeMonths(maskFromRange(5, 5))).toEqual([5]);
  });

  it("maskFromRange peut couvrir l'année entière", () => {
    expect(countActive(maskFromRange(3, 2))).toBe(12);
  });
});

describe("lecture", () => {
  it("isActiveIn répond par mois", () => {
    expect(isActiveIn(PLANTATION_ROSIER, 1)).toBe(true);
    expect(isActiveIn(PLANTATION_ROSIER, 6)).toBe(false);
  });

  it("reconnaît le masque vide et l'année pleine", () => {
    expect(isEmpty(EMPTY_MASK)).toBe(true);
    expect(isFullYear(maskFromRange(1, 12))).toBe(true);
    expect(isEmpty(PLANTATION_ROSIER)).toBe(false);
  });

  it("compte les mois concernés d'une période discontinue", () => {
    // Toute l'année sauf juin, juillet, août.
    expect(countActive(FLORAISON_CITRONNIER)).toBe(9);
    expect(activeMonths(FLORAISON_CITRONNIER)).toEqual([
      1, 2, 3, 4, 5, 9, 10, 11, 12,
    ]);
  });
});

describe("édition — la frise est l'éditeur", () => {
  it("toggleMonth active puis désactive", () => {
    const once = toggleMonth(EMPTY_MASK, 7);
    expect(isActiveIn(once, 7)).toBe(true);
    expect(isActiveIn(toggleMonth(once, 7), 7)).toBe(false);
  });

  it("toggleMonth ne touche à aucun autre mois", () => {
    const modified = toggleMonth(PLANTATION_ROSIER, 6);
    expect(activeMonths(modified)).toEqual([1, 2, 3, 6, 10, 11, 12]);
  });

  it("ne modifie pas le masque d'origine", () => {
    const before = toSerialised(PLANTATION_ROSIER);
    toggleMonth(PLANTATION_ROSIER, 6);
    expect(toSerialised(PLANTATION_ROSIER)).toEqual(before);
  });
});

describe("combinaison", () => {
  it("union rassemble", () => {
    expect(activeMonths(union(maskOf(1, 2), maskOf(2, 3)))).toEqual([1, 2, 3]);
  });

  it("intersection restreint — une action limitée à sa saison", () => {
    const fertilisation = maskFromRange(4, 9);
    const horsGel = maskFromRange(3, 11);
    expect(activeMonths(intersection(fertilisation, horsGel))).toEqual([
      4, 5, 6, 7, 8, 9,
    ]);
  });
});

describe("segments — pour les coins arrondis de la frise", () => {
  it("rend un segment unique pour une période continue", () => {
    expect(segments(maskFromRange(4, 6))).toEqual([{ from: 4, to: 6 }]);
  });

  it("⚠️ ne reboucle PAS sur l'année", () => {
    // Une frise est une bande linéaire de janvier à décembre. Octobre → mars
    // s'y lit comme deux segments visuels ; les arrondir comme un seul
    // enjambant le bord serait faux à l'œil.
    expect(segments(PLANTATION_ROSIER)).toEqual([
      { from: 1, to: 3 },
      { from: 10, to: 12 },
    ]);
  });

  it("sépare les segments d'une période discontinue", () => {
    expect(segments(FLORAISON_CITRONNIER)).toEqual([
      { from: 1, to: 5 },
      { from: 9, to: 12 },
    ]);
  });

  it("rend une liste vide pour un masque vide", () => {
    expect(segments(EMPTY_MASK)).toEqual([]);
  });

  it("isole les mois solitaires", () => {
    expect(segments(maskOf(2, 5, 11))).toEqual([
      { from: 2, to: 2 },
      { from: 5, to: 5 },
      { from: 11, to: 11 },
    ]);
  });
});

describe("sérialisation", () => {
  it("fait un aller-retour sans perte", () => {
    const serial = [1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1];
    expect(toSerialised(fromSerialised(serial))).toEqual(serial);
  });

  it("conserve la position 0 pour janvier", () => {
    expect(toSerialised(maskOf(1))[0]).toBe(1);
    expect(toSerialised(maskOf(12))[11]).toBe(1);
  });

  it("refuse un tableau de la mauvaise longueur", () => {
    expect(() => fromSerialised([1, 0, 1])).toThrow(InvalidMaskError);
  });

  it("refuse une valeur autre que 0 ou 1", () => {
    expect(() => fromSerialised([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow(
      InvalidMaskError,
    );
  });

  it("nomme le mois fautif dans le message", () => {
    expect(() => fromSerialised([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7])).toThrow(
      /mois 12/,
    );
  });
});
