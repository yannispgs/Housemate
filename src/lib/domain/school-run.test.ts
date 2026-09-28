import { describe, expect, it } from "vitest";
import { fromISO } from "@/lib/domain/plain-date";
import {
  DEFAULT_SCHOOL_RUN,
  decideSchoolRun,
  isSchoolDay,
  type RainHour,
  rainOverWindow,
  type SchoolRunCalendar,
} from "@/lib/domain/school-run";

const d = fromISO;
const NO_EXCEPTION: SchoolRunCalendar = {
  closures: [],
  skippedDays: [],
  extraDays: [],
};
const totals = (entries: Record<string, number>) =>
  new Map(Object.entries(entries));

describe("isSchoolDay", () => {
  it("suit les jours réglés : lundi, mardi, jeudi, vendredi", () => {
    // Semaine du lundi 28 septembre 2026.
    const week = ["28", "29", "30"].concat(["01", "02", "03", "04"]);
    const days = week.map((day, index) =>
      d(index < 3 ? `2026-09-${day}` : `2026-10-${day}`),
    );

    expect(
      days.map(day => isSchoolDay(day, DEFAULT_SCHOOL_RUN, NO_EXCEPTION)),
    ).toEqual([true, true, false, true, true, false, false]);
  });

  it("n'y va pas pendant une fermeture, bornes comprises", () => {
    const calendar = {
      ...NO_EXCEPTION,
      closures: [{ from: d("2026-10-19"), to: d("2026-10-30") }],
    };

    expect(isSchoolDay(d("2026-10-19"), DEFAULT_SCHOOL_RUN, calendar)).toBe(
      false,
    );
    expect(isSchoolDay(d("2026-10-30"), DEFAULT_SCHOOL_RUN, calendar)).toBe(
      false,
    );
    expect(isSchoolDay(d("2026-11-02"), DEFAULT_SCHOOL_RUN, calendar)).toBe(
      true,
    );
  });

  it("suit les exceptions de l'agenda, dans les deux sens", () => {
    const calendar = {
      ...NO_EXCEPTION,
      skippedDays: [d("2026-10-05")], // un lundi sans crèche
      extraDays: [d("2026-10-07")], // un mercredi avec
    };

    expect(isSchoolDay(d("2026-10-05"), DEFAULT_SCHOOL_RUN, calendar)).toBe(
      false,
    );
    expect(isSchoolDay(d("2026-10-07"), DEFAULT_SCHOOL_RUN, calendar)).toBe(
      true,
    );
  });

  it("⚠️ un jour ajouté l'emporte même sur une fermeture", () => {
    const calendar = {
      closures: [{ from: d("2026-10-19"), to: d("2026-10-30") }],
      skippedDays: [],
      extraDays: [d("2026-10-20")],
    };

    expect(isSchoolDay(d("2026-10-20"), DEFAULT_SCHOOL_RUN, calendar)).toBe(
      true,
    );
  });
});

describe("rainOverWindow", () => {
  const monday = d("2026-10-05"); // heure d'été : 8 h à Paris = 06:00 UTC
  const at = (iso: string, model: string, millimetres: number): RainHour => ({
    model,
    start: new Date(iso),
    millimetres,
  });

  it("⚠️ lit le créneau en heure de Paris, pas en UTC", () => {
    const totalsByModel = rainOverWindow(
      [
        at("2026-10-05T06:00:00Z", "icon_d2", 1.5), // 8 h – 9 h à Paris
        at("2026-10-05T08:00:00Z", "icon_d2", 9), // 10 h à Paris : hors créneau
      ],
      monday,
      DEFAULT_SCHOOL_RUN,
    );

    expect(totalsByModel).toEqual(new Map([["icon_d2", 1.5]]));
  });

  it("suit l'heure d'hiver : 8 h à Paris = 07:00 UTC en décembre", () => {
    const totalsByModel = rainOverWindow(
      [at("2026-12-07T07:00:00Z", "gfs_seamless", 2.2)],
      d("2026-12-07"),
      DEFAULT_SCHOOL_RUN,
    );

    expect(totalsByModel.get("gfs_seamless")).toBe(2.2);
  });

  it("additionne les heures d'un créneau plus long", () => {
    const totalsByModel = rainOverWindow(
      [
        at("2026-10-05T06:00:00Z", "ecmwf_ifs", 0.4),
        at("2026-10-05T07:00:00Z", "ecmwf_ifs", 0.8),
      ],
      monday,
      { ...DEFAULT_SCHOOL_RUN, toHour: 10 },
    );

    expect(totalsByModel.get("ecmwf_ifs")).toBe(1.2);
  });

  it("⚠️ écarte un modèle qui ne couvre pas tout le créneau", () => {
    const totalsByModel = rainOverWindow(
      [at("2026-10-05T06:00:00Z", "icon_d2", 0)],
      monday,
      { ...DEFAULT_SCHOOL_RUN, toHour: 10 },
    );

    expect(totalsByModel.size).toBe(0);
  });

  it("ignore un autre jour", () => {
    expect(
      rainOverWindow(
        [at("2026-10-06T06:00:00Z", "icon_d2", 5)],
        monday,
        DEFAULT_SCHOOL_RUN,
      ).size,
    ).toBe(0);
  });
});

describe("decideSchoolRun", () => {
  it("sec quand tous les modèles annoncent moins de 1 mm", () => {
    const decision = decideSchoolRun(
      totals({ a: 0, b: 0.4, c: 0.9 }),
      DEFAULT_SCHOOL_RUN,
    );

    expect(decision.verdict).toBe("dry");
  });

  it("pluie quand tous annoncent 2 mm ou plus", () => {
    expect(
      decideSchoolRun(totals({ a: 2, b: 3.4 }), DEFAULT_SCHOOL_RUN).verdict,
    ).toBe("rain");
  });

  it("doute entre 1 et 2 mm, même si tous sont d'accord", () => {
    expect(
      decideSchoolRun(totals({ a: 1.2, b: 1.9 }), DEFAULT_SCHOOL_RUN).verdict,
    ).toBe("doubt");
  });

  it("⚠️ doute quand les modèles se contredisent", () => {
    const decision = decideSchoolRun(
      totals({ a: 0, b: 2.5 }),
      DEFAULT_SCHOOL_RUN,
    );

    expect(decision.verdict).toBe("doubt");
    expect(decision.byModel).toEqual(
      new Map([
        ["a", "dry"],
        ["b", "rain"],
      ]),
    );
  });

  it("⚠️ doute sans aucune prévision", () => {
    expect(decideSchoolRun(new Map(), DEFAULT_SCHOOL_RUN).verdict).toBe(
      "doubt",
    );
  });
});
