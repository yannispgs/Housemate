import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  evaluateEvening,
  reviewNight,
  sendPending,
} from "../../workers/collecteur/src/frost-run";
import type { Mail } from "../../workers/collecteur/src/frost-watch";
import type { Sql } from "../../workers/collecteur/src/store";
import { DIRECT_URL } from "./env";

/**
 * La veille de gel de bout en bout, contre la base locale, avec les seuls
 * droits de `meteo_veille` : relevés et prévisions sont posés par le
 * propriétaire, tout le reste passe par le rôle de la veille.
 */
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner.end();
});

beforeEach(async () => {
  await owner`delete from meteo.nuits_gel`;
  await owner`delete from meteo.releves`;
  await owner`delete from meteo.previsions`;
  await owner`grant meteo_veille to current_user`;
});

async function asWatch<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  return (await owner.begin(async tx => {
    await tx`set local role meteo_veille`;

    return run(tx as unknown as Sql);
  })) as T;
}

// La nuit du 14 au 15 décembre 2026 : Paris est à UTC+1, donc 20 h = 19 h UTC
// et 9 h = 8 h UTC.
const NIGHT = "2026-12-14";
const EVENING = new Date("2026-12-14T19:02:00Z");
const RETRIEVED = "2026-12-14T19:01:00Z";

async function reading(capteur: string, instant: string, temperature: number) {
  await owner`
    insert into meteo.releves (capteur, instant, temperature, origine)
    values (${capteur}, ${instant}, ${temperature}, 'api')`;
}

async function forecast(
  modele: string,
  cible: string,
  temperature: number,
  recuperee = RETRIEVED,
) {
  await owner`
    insert into meteo.previsions (source, modele, recuperee_le, cible, temperature)
    values ('open-meteo', ${modele}, ${recuperee}, ${cible}, ${temperature})`;
}

async function journal() {
  const rows = await owner`
    select alerte, message, estimation::float8 as estimation,
      borne_basse::float8 as borne_basse, prevision_min::float8 as prevision_min,
      prevision_modele, extrapolation, envoyee_le,
      min_exterieur::float8 as min_exterieur, min_veranda::float8 as min_veranda,
      erreur_prevision::float8 as erreur_prevision,
      erreur_modele::float8 as erreur_modele
    from meteo.nuits_gel where nuit = ${NIGHT}`;

  return rows[0];
}

/** Un soir froid : véranda à 4 °C, extérieur à 1 °C, −4 °C annoncé. */
async function coldEvening() {
  await reading("exterieur", "2026-12-14T19:01:00Z", 1);
  await reading("veranda", "2026-12-14T19:01:00Z", 4);
  await forecast("arome", "2026-12-15T05:00:00Z", -4);
  await forecast("icon_d2", "2026-12-15T05:00:00Z", -2);
}

describe("evaluateEvening", () => {
  it("retient le modèle le plus froid, dans la fenêtre de la nuit", async () => {
    await coldEvening();
    // Hors fenêtre (10 h le 15) : ne compte pas, même plus froid.
    await forecast("arome", "2026-12-15T09:00:00Z", -9);
    // Une récupération plus ancienne du même modèle : périmée.
    await forecast(
      "icon_d2",
      "2026-12-15T05:00:00Z",
      -8,
      "2026-12-14T18:01:00Z",
    );

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    expect(row?.prevision_min).toBe(-4);
    expect(row?.prevision_modele).toBe("open-meteo/arome");
  });

  it("alerte sur le pire cas, et ouvre l'épisode", async () => {
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    // Δ_aube = 1,66 + 0,39 × 3 + 0,32 × 5 = 4,43 → −4 + 4,43 = 0,4 ;
    // extrapolation (−4 < 0,3) : marge du modèle doublée à 2,2.
    // Borne basse : 0,4 − 2,2 − 2 − 3 = −6,8.
    expect(row?.estimation).toBe(0.4);
    expect(row?.extrapolation).toBe("low");
    expect(row?.borne_basse).toBe(-6.8);
    expect(row?.alerte).toBe(true);
    expect(row?.message).toBe("alerte");
  });

  it("prolonge l'épisode par un rappel le lendemain d'une alerte", async () => {
    await owner`
      insert into meteo.nuits_gel (nuit, seuil_degats, alerte, message)
      values ('2026-12-13', 0, true, 'alerte')`;
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    expect((await journal())?.message).toBe("rappel");
  });

  it("se tait par nuit douce", async () => {
    await reading("exterieur", "2026-12-14T19:01:00Z", 12);
    await reading("veranda", "2026-12-14T19:01:00Z", 18);
    await forecast("arome", "2026-12-15T05:00:00Z", 9);

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    expect(row?.alerte).toBe(false);
    expect(row?.message).toBeNull();
  });

  it("dit qu'il ne peut pas décider quand un capteur manque et que la nuit peut geler", async () => {
    await reading("exterieur", "2026-12-14T19:01:00Z", 1);
    await forecast("arome", "2026-12-15T05:00:00Z", -1);

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    expect(row?.alerte).toBe(false);
    expect(row?.message).toBe("indisponible");
  });

  it("ignore un relevé d'un autre soir", async () => {
    await reading("exterieur", "2026-12-14T19:01:00Z", 1);
    await reading("veranda", "2026-12-13T19:01:00Z", 4);
    await forecast("arome", "2026-12-15T05:00:00Z", 8);

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    expect((await journal())?.estimation).toBeNull();
  });

  it("échoue haut et fort sans aucune prévision", async () => {
    await reading("exterieur", "2026-12-14T19:01:00Z", 1);
    await reading("veranda", "2026-12-14T19:01:00Z", 4);

    await expect(
      asWatch(sql => evaluateEvening(sql, NIGHT, EVENING)),
    ).rejects.toThrow("aucune prévision");
  });

  it("n'écrit qu'une ligne si 20 h se déclenche deux fois", async () => {
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const [{ n }] = await owner`select count(*)::int as n from meteo.nuits_gel`;

    expect(n).toBe(1);
  });
});

describe("sendPending", () => {
  it("envoie une fois, et une seule", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));
    const sent: Mail[] = [];

    await asWatch(sql =>
      sendPending(sql, NIGHT, async mail => {
        sent.push(mail);
      }),
    );
    await asWatch(sql =>
      sendPending(sql, NIGHT, async mail => {
        sent.push(mail);
      }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("chauffer");
    expect((await journal())?.envoyee_le).toBeInstanceOf(Date);
  });

  it("rend le message à la tentative suivante si l'envoi échoue", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    await expect(
      asWatch(sql =>
        sendPending(sql, NIGHT, async () => {
          throw new Error("relais indisponible");
        }),
      ),
    ).rejects.toThrow("relais indisponible");

    expect((await journal())?.envoyee_le).toBeNull();
  });

  it("n'envoie rien une nuit sans message", async () => {
    await owner`
      insert into meteo.nuits_gel (nuit, seuil_degats, alerte)
      values (${NIGHT}, 0, false)`;
    let calls = 0;

    await asWatch(sql =>
      sendPending(sql, NIGHT, async () => {
        calls += 1;
      }),
    );

    expect(calls).toBe(0);
  });
});

describe("reviewNight", () => {
  it("mesure les minima de 20 h à 9 h et sépare les deux erreurs", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));
    // Avant 20 h : hors de la nuit, même plus froid.
    await reading("exterieur", "2026-12-14T18:30:00Z", -10);
    await reading("exterieur", "2026-12-15T05:01:00Z", -3);
    await reading("veranda", "2026-12-15T06:01:00Z", 1.2);
    // Après 9 h 30 : le jour, hors de la nuit.
    await reading("veranda", "2026-12-15T10:01:00Z", -5);

    await asWatch(sql => reviewNight(sql, NIGHT));

    const row = await journal();

    // Prévision −4, mesuré −3 : la prévision était trop froide d'un degré.
    // Modèle avec l'extérieur mesuré : Δ = 1,66 + 1,17 + 0,32 × 4 = 4,11,
    // soit 1,1 prédit pour 1,2 mesuré.
    expect(row?.min_exterieur).toBe(-3);
    expect(row?.min_veranda).toBe(1.2);
    expect(row?.erreur_prevision).toBe(1);
    expect(row?.erreur_modele).toBe(0.1);
  });

  it("ne fait pas de bilan quand le soir n'avait pas de quoi prédire", async () => {
    await owner`
      insert into meteo.nuits_gel (nuit, seuil_degats, alerte, message, prevision_min)
      values (${NIGHT}, 0, false, 'indisponible', -1)`;
    await reading("exterieur", "2026-12-15T05:01:00Z", -3);

    await asWatch(sql => reviewNight(sql, NIGHT));

    expect((await journal())?.min_exterieur).toBeNull();
  });
});

describe("les droits de la veille", () => {
  it("ne peut pas déclarer une nuit chauffée : c'est au foyer de le dire", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    await expect(
      owner.begin(async tx => {
        await tx`set local role meteo_veille`;
        await tx`update meteo.nuits_gel set chauffee = true`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas réécrire la décision du soir", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    await expect(
      owner.begin(async tx => {
        await tx`set local role meteo_veille`;
        await tx`update meteo.nuits_gel set alerte = false`;
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
