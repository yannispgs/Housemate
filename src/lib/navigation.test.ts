import { describe, expect, it } from "vitest";
import {
  ALL_DESTINATIONS,
  isActive,
  PRIMARY_DESTINATIONS,
} from "@/lib/navigation";

describe("isActive", () => {
  it("marque la destination correspondant exactement au chemin", () => {
    expect(isActive("/inventaire", "/inventaire")).toBe(true);
  });

  it("marque une destination dont le chemin est un sous-chemin", () => {
    expect(isActive("/categories", "/categories/jardin")).toBe(true);
  });

  it("ne confond pas deux chemins partageant un préfixe textuel", () => {
    expect(isActive("/categories", "/categories-archivees")).toBe(false);
  });

  it("ne marque la racine que sur la racine", () => {
    // Sans ce cas particulier, « À traiter » resterait actif partout,
    // puisque tous les chemins commencent par « / ».
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/inventaire")).toBe(false);
  });
});

describe("carte de navigation", () => {
  it("garde exactement deux destinations de même rang", () => {
    // SPEC § 0 : une app, deux moitiés. Si cette liste grossit, c'est que la
    // hiérarchie du produit a changé et que le brief de design doit suivre.
    expect(PRIMARY_DESTINATIONS).toHaveLength(2);
  });

  it("n'a aucun chemin en double", () => {
    const hrefs = ALL_DESTINATIONS.map(d => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("donne à chaque destination la question à laquelle elle répond", () => {
    for (const destination of ALL_DESTINATIONS) {
      expect(destination.purpose.length).toBeGreaterThan(0);
    }
  });
});
