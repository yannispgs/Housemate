import { describe, expect, it } from "vitest";
import { mailFor } from "./frost-run";
import type { PendingMessage } from "./frost-store";
import {
  celsius,
  coldestForecast,
  frostMail,
  messageFor,
  undecidedMail,
} from "./frost-watch";

describe("coldestForecast", () => {
  it("retient le modèle le plus froid", () => {
    const coldest = coldestForecast([
      { source: "open-meteo", model: "arome", minimum: -1.2 },
      { source: "met-norway", model: "locationforecast", minimum: -2.4 },
      { source: "open-meteo", model: "icon_d2", minimum: 0.5 },
    ]);

    expect(coldest?.model).toBe("locationforecast");
  });

  it("ne retient rien sans prévision", () => {
    expect(coldestForecast([])).toBeNull();
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
  forecast: { source: "open-meteo", model: "arome", minimum: -3 },
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
    expect(mail.text).toContain("−3,0 °C (arome, le plus froid des modèles)");
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
    forecastModel: "open-meteo/arome",
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
