import { describe, expect, it } from "vitest";
import { fromSerialised, maskFromRange, maskOf } from "@/lib/domain/month-mask";
import { fromISO, toISO } from "@/lib/domain/plain-date";
import {
  addDuration,
  InvalidRecurrenceError,
  isScheduled,
  nextOccurrence,
  nextOccurrences,
  type Recurrence,
  type ScheduledRecurrence,
} from "@/lib/domain/recurrence";

const d = fromISO;
const next = (
  recurrence: ScheduledRecurrence,
  from: string,
  lastCompletion?: string,
) => {
  const result = nextOccurrence(recurrence, {
    from: d(from),
    ...(lastCompletion ? { lastCompletion: d(lastCompletion) } : {}),
  });
  return result ? toISO(result) : null;
};

describe("séparation des motifs calculables", () => {
  it("reconnaît les six motifs calculables depuis une date", () => {
    expect(isScheduled({ kind: "once", on: d("2027-01-01") })).toBe(true);
    expect(isScheduled({ kind: "annual", month: 3, day: 12 })).toBe(true);
  });

  it("écarte le dormant, le compteur et le seuil", () => {
    // Ils ne peuvent produire aucune prochaine occurrence : le dormant n'a pas
    // de date, le compteur dépend d'un relevé, le seuil d'un événement
    // extérieur qui peut ne jamais survenir.
    const unscheduled: Recurrence[] = [
      { kind: "dormant" },
      { kind: "counter", every: 15000, unit: "km" },
      { kind: "threshold", metric: "temperature", below: 0 },
    ];
    for (const recurrence of unscheduled) {
      expect(isScheduled(recurrence)).toBe(false);
    }
  });
});

describe("1 — intervalle calendaire", () => {
  const tousLes15Jours: ScheduledRecurrence = {
    kind: "interval",
    anchor: d("2026-04-01"),
    every: { count: 15, unit: "day" },
  };

  it("rend l'ancre elle-même si on part d'avant", () => {
    expect(next(tousLes15Jours, "2026-01-01")).toBe("2026-04-01");
  });

  it("rend l'ancre le jour même", () => {
    expect(next(tousLes15Jours, "2026-04-01")).toBe("2026-04-01");
  });

  it("avance au pas suivant dès le lendemain", () => {
    expect(next(tousLes15Jours, "2026-04-02")).toBe("2026-04-16");
  });

  it("tient sur de longues distances sans se recaler sur l'ancre", () => {
    // 2026 n'est pas bissextile : un an plus tard, on est à 365 jours de
    // l'ancre, soit 24 pas de 15 jours et un reste. La 25ᵉ répétition tombe
    // donc le 11 avril, pas le 1er — la cadence ne se resynchronise pas avec
    // le calendrier, et c'est voulu.
    expect(next(tousLes15Jours, "2027-04-01")).toBe("2027-04-11");
  });

  it("gère les semaines", () => {
    const hebdo: ScheduledRecurrence = {
      kind: "interval",
      anchor: d("2026-09-14"),
      every: { count: 2, unit: "week" },
    };
    expect(next(hebdo, "2026-09-15")).toBe("2026-09-28");
  });

  it("⚠️ garde le 31 sur une série mensuelle", () => {
    // Le piège traité dans plain-date : de proche en proche, le rabattement
    // d'avril contaminerait toute la suite.
    const trimestriel: ScheduledRecurrence = {
      kind: "interval",
      anchor: d("2026-01-31"),
      every: { count: 3, unit: "month" },
    };
    expect(next(trimestriel, "2026-05-01")).toBe("2026-07-31");
    expect(next(trimestriel, "2026-08-01")).toBe("2026-10-31");
  });

  it("refuse un intervalle nul ou négatif", () => {
    expect(() =>
      next(
        {
          kind: "interval",
          anchor: d("2026-01-01"),
          every: { count: 0, unit: "day" },
        },
        "2026-01-01",
      ),
    ).toThrow(InvalidRecurrenceError);
  });
});

describe("2 — date annuelle fixe", () => {
  const anniversaire: ScheduledRecurrence = {
    kind: "annual",
    month: 3,
    day: 12,
  };

  it("rend la date de l'année en cours si elle est à venir", () => {
    expect(next(anniversaire, "2027-01-01")).toBe("2027-03-12");
  });

  it("rend la date du jour même", () => {
    expect(next(anniversaire, "2027-03-12")).toBe("2027-03-12");
  });

  it("passe à l'année suivante une fois la date franchie", () => {
    expect(next(anniversaire, "2027-03-13")).toBe("2028-03-12");
  });

  it("⚠️ rabat un 29 février sur le 28 les années non bissextiles", () => {
    // Cas réel : un anniversaire le 29 février. Refuser la date serait
    // absurde, la décaler au 1er mars la ferait changer de mois.
    const neLe29: ScheduledRecurrence = { kind: "annual", month: 2, day: 29 };
    expect(next(neLe29, "2026-01-01")).toBe("2026-02-28");
    expect(next(neLe29, "2028-01-01")).toBe("2028-02-29");
  });
});

describe("3 — intervalle dans une fenêtre saisonnière", () => {
  // L'exemple d'origine : engrais du citronnier tous les 15 jours d'avril à
  // septembre.
  const engrais: ScheduledRecurrence = {
    kind: "seasonal",
    every: { count: 15, unit: "day" },
    season: maskFromRange(4, 9),
    startDay: 1,
  };

  it("démarre à l'ouverture de la saison", () => {
    expect(next(engrais, "2026-02-10")).toBe("2026-04-01");
  });

  it("suit le pas à l'intérieur de la saison", () => {
    expect(next(engrais, "2026-04-02")).toBe("2026-04-16");
    expect(next(engrais, "2026-04-17")).toBe("2026-05-01");
  });

  it("se tait hors saison et repart l'année suivante", () => {
    // Après septembre, plus rien jusqu'en avril : c'est précisément ce qu'un
    // intervalle simple ne sait pas faire.
    expect(next(engrais, "2026-10-15")).toBe("2027-04-01");
    expect(next(engrais, "2027-01-20")).toBe("2027-04-01");
  });

  it("redémarre chaque saison au même jour", () => {
    // La cadence ne se verrouille pas sur une ancre lointaine : sinon le
    // premier engrais dériverait d'année en année.
    expect(next(engrais, "2027-03-31")).toBe("2027-04-01");
    expect(next(engrais, "2028-03-31")).toBe("2028-04-01");
  });

  it("⚠️ traverse le nouvel an quand le masque le fait", () => {
    // Octobre → mars est UNE saison continue dans le temps, contrairement à
    // l'affichage où elle se lit en deux segments (bande linéaire de janvier à
    // décembre). Même masque, deux découpages.
    const hivernage: ScheduledRecurrence = {
      kind: "seasonal",
      every: { count: 1, unit: "month" },
      season: fromSerialised([1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1]),
      startDay: 1,
    };
    expect(next(hivernage, "2026-11-15")).toBe("2026-12-01");
    // Décembre → janvier : la saison ne s'interrompt pas au changement d'année.
    expect(next(hivernage, "2026-12-02")).toBe("2027-01-01");
  });

  it("gère un masque discontinu", () => {
    // Citronnier : fleurit toute l'année sauf en été.
    const horsEte: ScheduledRecurrence = {
      kind: "seasonal",
      every: { count: 1, unit: "month" },
      season: fromSerialised([1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1]),
      startDay: 1,
    };
    expect(next(horsEte, "2026-05-02")).toBe("2026-09-01");
  });

  it("ne rend rien pour une saison vide", () => {
    expect(
      next(
        {
          kind: "seasonal",
          every: { count: 15, unit: "day" },
          season: maskOf(),
          startDay: 1,
        },
        "2026-01-01",
      ),
    ).toBeNull();
  });
});

describe("4 — depuis la dernière complétion", () => {
  const rempotage: ScheduledRecurrence = {
    kind: "sinceCompletion",
    after: { count: 3, unit: "month" },
  };

  it("compte depuis la complétion, pas depuis le calendrier", () => {
    expect(next(rempotage, "2026-04-01", "2026-03-10")).toBe("2026-06-10");
  });

  it("est due tout de suite si le délai est déjà passé", () => {
    expect(next(rempotage, "2026-09-01", "2026-03-10")).toBe("2026-09-01");
  });

  it("est due tout de suite si elle n'a jamais été faite", () => {
    // Une tâche « tous les trois mois depuis la dernière fois » jamais faite
    // est à faire : sans cette règle elle resterait invisible pour toujours.
    expect(next(rempotage, "2026-04-01")).toBe("2026-04-01");
  });

  it("dérive volontairement avec le geste réel", () => {
    // Fait trois jours en retard : la suivante se décale d'autant. C'est la
    // réalité qui fait foi, pas le calendrier (SPEC § 3.4, motif 4).
    expect(next(rempotage, "2026-06-01", "2026-03-13")).toBe("2026-06-13");
  });
});

describe("5 — dérivée d'un attribut", () => {
  // Le cas de la télé : date d'achat + deux ans de garantie.
  const finDeGarantie: ScheduledRecurrence = {
    kind: "derived",
    sourceDate: d("2025-03-12"),
    offset: { count: 2, unit: "year" },
  };

  it("calcule l'échéance depuis la date source", () => {
    expect(next(finDeGarantie, "2026-01-01")).toBe("2027-03-12");
  });

  it("se déplace si la date source est corrigée", () => {
    const corrigee: ScheduledRecurrence = {
      ...finDeGarantie,
      sourceDate: d("2025-05-20"),
    };
    expect(next(corrigee, "2026-01-01")).toBe("2027-05-20");
  });

  it("ne rend plus rien une fois passée", () => {
    expect(next(finDeGarantie, "2027-03-13")).toBeNull();
  });
});

describe("6 — ponctuelle", () => {
  const resiliation: ScheduledRecurrence = {
    kind: "once",
    on: d("2026-11-30"),
  };

  it("rend la date tant qu'elle est à venir", () => {
    expect(next(resiliation, "2026-01-01")).toBe("2026-11-30");
  });

  it("ne rend plus rien une fois passée", () => {
    expect(next(resiliation, "2026-12-01")).toBeNull();
  });
});

describe("séries", () => {
  it("déroule un intervalle saisonnier sur une saison entière", () => {
    const engrais: ScheduledRecurrence = {
      kind: "seasonal",
      every: { count: 15, unit: "day" },
      season: maskFromRange(4, 9),
      startDay: 1,
    };
    const serie = nextOccurrences(engrais, { from: d("2026-04-01") }, 5).map(
      toISO,
    );
    expect(serie).toEqual([
      "2026-04-01",
      "2026-04-16",
      "2026-05-01",
      "2026-05-16",
      "2026-05-31",
    ]);
  });

  it("déroule des anniversaires successifs", () => {
    const serie = nextOccurrences(
      { kind: "annual", month: 3, day: 12 },
      { from: d("2026-06-01") },
      3,
    ).map(toISO);
    expect(serie).toEqual(["2027-03-12", "2028-03-12", "2029-03-12"]);
  });

  it("ne répète pas une échéance ponctuelle", () => {
    const serie = nextOccurrences(
      { kind: "once", on: d("2026-11-30") },
      { from: d("2026-01-01") },
      5,
    );
    expect(serie).toHaveLength(1);
  });

  it("ne répète pas une échéance dérivée", () => {
    const serie = nextOccurrences(
      {
        kind: "derived",
        sourceDate: d("2025-03-12"),
        offset: { count: 2, unit: "year" },
      },
      { from: d("2026-01-01") },
      5,
    );
    expect(serie).toHaveLength(1);
  });
});

describe("addDuration", () => {
  it("couvre les quatre unités", () => {
    const anchor = d("2026-01-15");
    expect(toISO(addDuration(anchor, { count: 10, unit: "day" }, 1))).toBe(
      "2026-01-25",
    );
    expect(toISO(addDuration(anchor, { count: 2, unit: "week" }, 1))).toBe(
      "2026-01-29",
    );
    expect(toISO(addDuration(anchor, { count: 3, unit: "month" }, 1))).toBe(
      "2026-04-15",
    );
    expect(toISO(addDuration(anchor, { count: 1, unit: "year" }, 2))).toBe(
      "2028-01-15",
    );
  });
});
