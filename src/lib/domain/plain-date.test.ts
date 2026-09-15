import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addMonthsFromAnchor,
  addYears,
  compare,
  daysBetween,
  daysInMonth,
  fromISO,
  InvalidDateError,
  isAfter,
  isBefore,
  isLeapYear,
  isSameDay,
  localDay,
  plainDate,
  toISO,
} from "@/lib/domain/plain-date";

describe("construction", () => {
  it("refuse un mois hors bornes", () => {
    expect(() => plainDate(2026, 13, 1)).toThrow(InvalidDateError);
  });

  it("refuse un jour qui n'existe pas dans le mois", () => {
    expect(() => plainDate(2026, 2, 29)).toThrow(InvalidDateError);
    expect(() => plainDate(2026, 4, 31)).toThrow(InvalidDateError);
  });

  it("accepte le 29 février d'une année bissextile", () => {
    expect(toISO(plainDate(2028, 2, 29))).toBe("2028-02-29");
  });

  it("dit combien de jours compte le mois fautif", () => {
    expect(() => plainDate(2026, 4, 31)).toThrow(/30 jours/);
  });
});

describe("années bissextiles", () => {
  it("applique la règle des siècles", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // divisible par 100
    expect(isLeapYear(2000)).toBe(true); // divisible par 400
  });

  it("donne 29 jours à février les années bissextiles", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});

describe("comparaison", () => {
  const mars = plainDate(2027, 3, 12);
  const avril = plainDate(2027, 4, 1);

  it("ordonne deux dates", () => {
    expect(isBefore(mars, avril)).toBe(true);
    expect(isAfter(avril, mars)).toBe(true);
    expect(compare(mars, mars)).toBe(0);
  });

  it("reconnaît le même jour", () => {
    expect(isSameDay(mars, plainDate(2027, 3, 12))).toBe(true);
  });

  it("compare l'année avant le mois", () => {
    expect(isBefore(plainDate(2026, 12, 31), plainDate(2027, 1, 1))).toBe(true);
  });
});

describe("arithmétique en jours", () => {
  it("franchit un changement de mois", () => {
    expect(toISO(addDays(plainDate(2026, 1, 31), 1))).toBe("2026-02-01");
  });

  it("franchit un changement d'année", () => {
    expect(toISO(addDays(plainDate(2026, 12, 31), 1))).toBe("2027-01-01");
  });

  it("franchit un 29 février", () => {
    expect(toISO(addDays(plainDate(2028, 2, 28), 1))).toBe("2028-02-29");
    expect(toISO(addDays(plainDate(2026, 2, 28), 1))).toBe("2026-03-01");
  });

  it("recule avec un nombre négatif", () => {
    expect(toISO(addDays(plainDate(2026, 3, 1), -1))).toBe("2026-02-28");
  });

  it("compte les jours entre deux dates", () => {
    expect(daysBetween(plainDate(2026, 1, 1), plainDate(2026, 1, 16))).toBe(15);
    expect(daysBetween(plainDate(2026, 1, 16), plainDate(2026, 1, 1))).toBe(
      -15,
    );
    expect(daysBetween(plainDate(2028, 1, 1), plainDate(2029, 1, 1))).toBe(366);
  });

  it("fait un aller-retour sur de longues distances", () => {
    const start = plainDate(2026, 9, 15);
    expect(toISO(addDays(addDays(start, 4000), -4000))).toBe("2026-09-15");
  });
});

describe("arithmétique en mois — le rabattement", () => {
  it("rabat sur le dernier jour du mois cible", () => {
    // 31 janvier + 1 mois : le 31 février n'existe pas.
    expect(toISO(addMonths(plainDate(2026, 1, 31), 1))).toBe("2026-02-28");
    expect(toISO(addMonths(plainDate(2028, 1, 31), 1))).toBe("2028-02-29");
    expect(toISO(addMonths(plainDate(2026, 3, 31), 1))).toBe("2026-04-30");
  });

  it("ne rabat pas quand le jour existe", () => {
    expect(toISO(addMonths(plainDate(2026, 1, 15), 2))).toBe("2026-03-15");
  });

  it("recule aussi", () => {
    expect(toISO(addMonths(plainDate(2026, 1, 15), -2))).toBe("2025-11-15");
  });

  it("ajoute des années, 29 février compris", () => {
    expect(toISO(addYears(plainDate(2028, 2, 29), 1))).toBe("2029-02-28");
    expect(toISO(addYears(plainDate(2028, 2, 29), 4))).toBe("2032-02-29");
  });
});

describe("⚠️ série mensuelle : depuis l'ancre, jamais de proche en proche", () => {
  const ancre = plainDate(2026, 1, 31);

  it("retrouve le 31 après avoir traversé un mois court", () => {
    // C'est le cœur du sujet. « Tous les trois mois depuis le 31 janvier ».
    expect(toISO(addMonthsFromAnchor(ancre, 3, 1))).toBe("2026-04-30");
    expect(toISO(addMonthsFromAnchor(ancre, 3, 2))).toBe("2026-07-31");
    expect(toISO(addMonthsFromAnchor(ancre, 3, 3))).toBe("2026-10-31");
  });

  it("diverge du calcul de proche en proche, qui perd le 31", () => {
    // Enchaîner les ajouts contamine toute la série : le rabattement d'avril
    // se propage et le 31 ne revient jamais.
    const deProcheEnProche = addMonths(addMonths(ancre, 3), 3);
    expect(toISO(deProcheEnProche)).toBe("2026-07-30");
    expect(toISO(addMonthsFromAnchor(ancre, 3, 2))).toBe("2026-07-31");
  });

  it("rend l'ancre elle-même à l'occurrence zéro", () => {
    expect(toISO(addMonthsFromAnchor(ancre, 3, 0))).toBe("2026-01-31");
  });
});

describe("sérialisation", () => {
  it("fait un aller-retour ISO sans perte", () => {
    expect(toISO(fromISO("2027-03-12"))).toBe("2027-03-12");
  });

  it("complète les zéros", () => {
    expect(toISO(plainDate(2026, 3, 5))).toBe("2026-03-05");
  });

  it("refuse un format approximatif", () => {
    expect(() => fromISO("2027-3-12")).toThrow(InvalidDateError);
    expect(() => fromISO("12/03/2027")).toThrow(InvalidDateError);
    // Pas d'heure : ce type ne désigne pas un instant.
    expect(() => fromISO("2027-03-12T00:00:00Z")).toThrow(InvalidDateError);
  });

  it("refuse une date syntaxiquement correcte mais inexistante", () => {
    expect(() => fromISO("2026-02-30")).toThrow(InvalidDateError);
  });
});

describe("localDay — le piège UTC", () => {
  it("retient le jour local, pas le jour UTC", () => {
    // 23 h 30 heure locale un 12 mars : `toISOString()` imprimerait le 13 si
    // le décalage est positif. Une complétion du soir serait filée au
    // lendemain, et la série suivante décalée d'un jour.
    const soir = new Date(2027, 2, 12, 23, 30);
    expect(toISO(localDay(soir))).toBe("2027-03-12");
  });

  it("retient le jour local en tout début de journée", () => {
    const matin = new Date(2027, 2, 12, 0, 15);
    expect(toISO(localDay(matin))).toBe("2027-03-12");
  });
});
