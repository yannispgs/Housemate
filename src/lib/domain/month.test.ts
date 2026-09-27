import { describe, expect, it } from "vitest";
import { isMonth, MONTHS, monthName, nextMonth } from "@/lib/domain/month";

describe("isMonth", () => {
  it("n'admet que 1 à 12, en entiers", () => {
    expect(MONTHS.every(isMonth)).toBe(true);
    expect([0, 13, 1.5, Number.NaN].some(isMonth)).toBe(false);
  });
});

describe("monthName", () => {
  it("nomme les mois en base 1 : janvier vaut 1", () => {
    expect(monthName(1)).toBe("janvier");
    expect(monthName(8)).toBe("août");
    expect(monthName(12)).toBe("décembre");
  });
});

describe("nextMonth", () => {
  it("repasse de décembre à janvier", () => {
    expect(nextMonth(12)).toBe(1);
    expect(nextMonth(3)).toBe(4);
  });
});
