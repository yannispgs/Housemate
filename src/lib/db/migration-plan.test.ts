import { describe, expect, it } from "vitest";
import { planMigrations } from "@/lib/db/migration-plan";

const file = (version: string, checksum = `sum-${version}`) => ({
  version,
  checksum,
});

describe("planMigrations", () => {
  it("applique tout, dans l'ordre, sur une base vierge", () => {
    const plan = planMigrations([file("0002_b.sql"), file("0001_a.sql")], []);

    expect(plan).toEqual({
      ok: true,
      pending: [file("0001_a.sql"), file("0002_b.sql")],
    });
  });

  it("n'applique que ce qui manque", () => {
    const plan = planMigrations(
      [file("0001_a.sql"), file("0002_b.sql")],
      [file("0001_a.sql")],
    );

    expect(plan).toEqual({ ok: true, pending: [file("0002_b.sql")] });
  });

  it("ne fait rien quand tout est appliqué", () => {
    const plan = planMigrations([file("0001_a.sql")], [file("0001_a.sql")]);

    expect(plan).toEqual({ ok: true, pending: [] });
  });

  it("refuse une migration modifiée après application", () => {
    const plan = planMigrations(
      [file("0001_a.sql", "nouvelle-empreinte")],
      [file("0001_a.sql", "ancienne-empreinte")],
    );

    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.errors[0]).toMatch(/modifiée après/);
  });

  it("refuse une migration appliquée qui a disparu du dépôt", () => {
    const plan = planMigrations([], [file("0001_a.sql")]);

    expect(!plan.ok && plan.errors[0]).toMatch(/absente du dépôt/);
  });

  it("refuse d'insérer une migration avant la dernière appliquée", () => {
    const plan = planMigrations(
      [file("0001_a.sql"), file("0002_b.sql"), file("0003_c.sql")],
      [file("0001_a.sql"), file("0003_c.sql")],
    );

    expect(!plan.ok && plan.errors[0]).toMatch(/plus ancienne que 0003_c/);
  });

  it("refuse un nom de fichier hors convention", () => {
    const plan = planMigrations([file("meteo.sql")], []);

    expect(!plan.ok && plan.errors[0]).toMatch(/nom invalide/);
  });

  it("rassemble toutes les erreurs au lieu de s'arrêter à la première", () => {
    const plan = planMigrations(
      [file("0001_a.sql", "autre"), file("mauvais.sql")],
      [file("0001_a.sql"), file("0002_b.sql")],
    );

    expect(!plan.ok && plan.errors).toHaveLength(3);
  });
});
