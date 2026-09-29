import { describe, expect, it } from "vitest";
import {
  parisHour,
  shouldFetchRainForecasts,
  shouldFetchTemperatureForecasts,
  shouldReadSensors,
} from "./schedule";

describe("parisHour", () => {
  it("ajoute deux heures en été", () => {
    expect(parisHour(new Date("2026-07-14T18:00:00Z"))).toBe(20);
  });

  it("ajoute une heure en hiver", () => {
    expect(parisHour(new Date("2026-12-14T19:00:00Z"))).toBe(20);
  });

  it("suit le changement d'heure d'octobre dans la nuit même", () => {
    // Dimanche 25 octobre 2026, 3 h d'été redevient 2 h d'hiver.
    expect(parisHour(new Date("2026-10-25T00:30:00Z"))).toBe(2);
    expect(parisHour(new Date("2026-10-25T01:30:00Z"))).toBe(2);
    expect(parisHour(new Date("2026-10-25T02:30:00Z"))).toBe(3);
  });

  it("écrit minuit 0, pas 24", () => {
    expect(parisHour(new Date("2026-12-14T23:00:00Z"))).toBe(0);
  });
});

describe("shouldReadSensors", () => {
  it("relève de 20 h à 9 h inclus", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => hour).filter(
      shouldReadSensors,
    );

    expect(hours).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21, 22, 23]);
  });
});

describe("prévisions figées une fois par soir", () => {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  it("fige les températures à 20 h, avec le relevé du gel", () => {
    expect(hours.filter(shouldFetchTemperatureForecasts)).toEqual([20]);
  });

  it("fige la pluie à 22 h, l'heure du rappel de crèche", () => {
    expect(hours.filter(shouldFetchRainForecasts)).toEqual([22]);
  });
});
