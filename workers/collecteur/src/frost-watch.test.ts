import { describe, expect, it } from "vitest";
import { mailFor } from "./frost-run";
import type { PendingMessage } from "./frost-store";
import {
  blendForecasts,
  celsius,
  frostMail,
  messageFor,
  undecidedMail,
} from "./frost-watch";

const tonight = [
  { source: "open-meteo", model: "arome", minimum: -2 },
  { source: "open-meteo", model: "icon_d2", minimum: -1 },
  { source: "met-norway", model: "locationforecast", minimum: 1 },
];

const scored = (model: string, rmse: number, nights = 20) => ({
  source: model === "locationforecast" ? "met-norway" : "open-meteo",
  model,
  nights,
  rmse,
});

describe("blendForecasts", () => {
  it("fait une moyenne simple tant qu'aucun modèle n'est noté", () => {
    const blend = blendForecasts(tonight, [scored("arome", 0.5, 4)]);

    expect(blend?.minimum).toBe(-0.7);
    expect(blend?.method).toBe("moyenne simple de 3 modèles, pas encore notés");
    expect(blend?.models.map(entry => entry.weight)).toEqual([
      1 / 3,
      1 / 3,
      1 / 3,
    ]);
  });

  it("donne plus de poids aux modèles fiables", () => {
    // Erreurs 0,5 et 1 : poids 4 et 1, soit 80 % et 20 %.
    const blend = blendForecasts(tonight.slice(0, 2), [
      scored("arome", 0.5),
      scored("icon_d2", 1),
    ]);

    expect(blend?.models.map(entry => entry.weight)).toEqual([0.8, 0.2]);
    expect(blend?.minimum).toBe(-1.8);
    expect(blend?.method).toBe(
      "moyenne de 2 modèles sur 2, pondérée par leur fiabilité",
    );
  });

  it("écarte un modèle plus de deux fois moins fiable que le meilleur", () => {
    const blend = blendForecasts(tonight, [
      scored("arome", 0.5),
      scored("icon_d2", 0.8),
      scored("locationforecast", 1.2),
    ]);

    expect(blend?.models[2]?.weight).toBe(0);
    expect(blend?.method).toBe(
      "moyenne de 2 modèles sur 3, pondérée par leur fiabilité",
    );
  });

  it("ne laisse pas un modèle chanceux écraser les autres", () => {
    // Une erreur de 0,05 sur quelques nuits est ramenée au plancher de 0,3.
    const blend = blendForecasts(tonight.slice(0, 2), [
      scored("arome", 0.05),
      scored("icon_d2", 0.6),
    ]);

    expect(blend?.models[0]?.weight).toBeCloseTo(0.8);
  });

  it("fait peser un modèle pas encore noté comme un modèle moyen", () => {
    const blend = blendForecasts(tonight, [
      scored("arome", 0.5),
      scored("icon_d2", 1),
    ]);

    // Poids bruts 4, 1, et la médiane des deux, 2,5.
    expect(blend?.models.map(entry => entry.weight)).toEqual([
      4 / 7.5,
      1 / 7.5,
      2.5 / 7.5,
    ]);
  });

  it("prend la médiane du milieu quand les modèles notés sont en nombre impair", () => {
    const blend = blendForecasts(
      [...tonight, { source: "open-meteo", model: "ecmwf_ifs", minimum: 0 }],
      [
        scored("arome", 0.5),
        scored("icon_d2", 1),
        scored("locationforecast", 0.8),
      ],
    );

    // Poids bruts 4, 1 et 1/0,64 = 1,5625 : la médiane, 1,5625, va à ECMWF.
    expect(blend?.models[3]?.weight).toBeCloseTo(blend?.models[2]?.weight ?? 0);
  });

  it("ne retient rien sans prévision", () => {
    expect(blendForecasts([], [])).toBeNull();
  });
});

describe("messageFor", () => {
  it("ouvre l'épisode par une alerte, le prolonge par des rappels", () => {
    expect(messageFor(true, false)).toBe("alerte");
    expect(messageFor(true, true)).toBe("rappel");
  });

  it("se tait quand il ne gèle pas, même au lendemain d'une alerte", () => {
    expect(messageFor(false, false)).toBeNull();
    expect(messageFor(false, true)).toBeNull();
  });
});

describe("celsius", () => {
  it("écrit à la française, avec un vrai signe moins", () => {
    expect(celsius(-2.46)).toBe("−2,5 °C");
    expect(celsius(3)).toBe("3,0 °C");
  });
});

const facts = {
  exteriorAt20h: 1.5,
  verandaAt20h: 4.2,
  forecast: { minimum: -3, method: "moyenne de 5 modèles sur 5" },
  prediction: { estimate: 2.1, margin: 1.1, extrapolation: "low" as const },
  decision: { alert: true, lowerBound: -4, extrapolation: "low" as const },
};

describe("frostMail", () => {
  it("dit quoi faire, et sur quels chiffres", () => {
    const mail = frostMail("alerte", facts);

    expect(mail.subject).toBe(
      "Gel possible dans la véranda cette nuit : chauffer",
    );
    expect(mail.text).toContain("Chauffer ce soir.");
    expect(mail.text).toContain("Minimum attendu dans la véranda : 2,1 °C");
    expect(mail.text).toContain("Pire cas retenu : −4,0 °C");
    expect(mail.text).toContain("−3,0 °C (moyenne de 5 modèles sur 5)");
    expect(mail.text).toContain("marge est doublée");
  });

  it("fait court pour un rappel", () => {
    const mail = frostMail("rappel", {
      ...facts,
      prediction: { ...facts.prediction, extrapolation: "none" },
      decision: { ...facts.decision, extrapolation: "none" },
    });

    expect(mail.subject).toBe("Véranda : chauffer encore cette nuit");
    expect(mail.text.startsWith("L'épisode froid continue.")).toBe(true);
    expect(mail.text).not.toContain("marge est doublée");
  });
});

describe("undecidedMail", () => {
  it("nomme ce qui manque", () => {
    const mail = undecidedMail(["le relevé de la véranda"], facts.forecast);

    expect(mail.subject).toBe("Veille de gel impossible ce soir");
    expect(mail.text).toContain("Il manque le relevé de la véranda");
  });
});

describe("mailFor", () => {
  const pending: PendingMessage = {
    night: "2026-12-14",
    message: "alerte",
    exteriorAt20h: 1.5,
    verandaAt20h: 4.2,
    forecastMinimum: -3,
    forecastMethod: "moyenne simple de 5 modèles, pas encore notés",
    estimate: 2.1,
    modelMargin: 1.1,
    lowerBound: -4,
    extrapolation: "none",
  };

  it("rebâtit l'alerte à partir de la ligne du journal", () => {
    const mail = mailFor(pending);

    expect(mail.subject).toContain("chauffer");
    expect(mail.text).toContain("Pire cas retenu : −4,0 °C");
  });

  it("nomme le seul capteur muet", () => {
    const withoutExterior = mailFor({
      ...pending,
      message: "indisponible",
      exteriorAt20h: null,
    });
    const withoutVeranda = mailFor({
      ...pending,
      message: "indisponible",
      verandaAt20h: null,
    });

    expect(withoutExterior.text).toContain("Il manque le relevé extérieur :");
    expect(withoutVeranda.text).toContain(
      "Il manque le relevé de la véranda :",
    );
  });

  it("se replie sur l'impossibilité si la ligne est incomplète", () => {
    const mail = mailFor({ ...pending, estimate: null });

    expect(mail.subject).toBe("Veille de gel impossible ce soir");
  });

  it("dit l'impossibilité quand un relevé manquait", () => {
    const mail = mailFor({
      ...pending,
      message: "indisponible",
      verandaAt20h: null,
      exteriorAt20h: null,
      estimate: null,
      modelMargin: null,
      lowerBound: null,
      extrapolation: null,
    });

    expect(mail.text).toContain(
      "Il manque le relevé de la véranda et le relevé extérieur",
    );
  });
});
