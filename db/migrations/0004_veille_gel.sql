-- Veille de gel en véranda (SPEC § 12.8) : le journal du soir.
--
-- Chaque soir à 20 h, une ligne : ce qu'on savait (relevés, prévision retenue),
-- ce qu'on a prédit, ce qu'on a décidé. Chaque matin à 9 h, la même ligne
-- reçoit ce qui s'est vraiment passé, et les deux erreurs de la nuit.
--
-- C'est la trace que le protocole du banc d'essai (§ 5 bis) rend
-- indispensable : sans elle, l'erreur de PRÉVISION n'est pas mesurable, et la
-- marge qui la couvre reste un chiffre posé à la main.

create table meteo.nuits_gel (
  -- Le soir de la décision, en date de Paris : la nuit du 14 au 15 est `14`.
  nuit date primary key,
  decidee_le timestamptz not null default now(),

  -- Ce qu'on savait à 20 h. Vide si le capteur était muet.
  exterieur_20h numeric(4, 1),
  veranda_20h numeric(4, 1),
  -- Le minimum extérieur retenu pour la nuit, et le modèle qui l'annonçait :
  -- le plus froid de tous, tant que le banc d'essai n'a rien départagé.
  prevision_min numeric(4, 1),
  prevision_modele text,

  -- Ce qu'on a prédit, avec les marges telles qu'appliquées CE soir-là : elles
  -- changeront, et un bilan doit se relire avec les réglages de l'époque.
  estimation numeric(4, 1),
  marge_modele numeric(3, 1),
  marge_prevision numeric(3, 1),
  marge_radiative numeric(3, 1),
  seuil_degats numeric(4, 1) not null,
  borne_basse numeric(4, 1),
  extrapolation text check (extrapolation in ('none', 'low', 'high')),

  -- Ce qu'on a décidé, et ce qui est parti.
  alerte boolean not null,
  -- `alerte` ouvre un épisode, `rappel` le prolonge (§ 12.8 b),
  -- `indisponible` dit qu'on n'a pas pu décider une nuit qui pouvait geler.
  message text check (message in ('alerte', 'rappel', 'indisponible')),
  envoyee_le timestamptz,

  -- Ce qui s'est passé, écrit à 9 h.
  min_exterieur numeric(4, 1),
  min_veranda numeric(4, 1),
  erreur_prevision numeric(4, 1),
  erreur_modele numeric(4, 1),
  bilan_le timestamptz,
  -- Nuit chauffée (§ 12.8 c) : vide tant que personne ne l'a dit. Une nuit
  -- chauffée ne doit jamais entrer dans un recalage du modèle.
  chauffee boolean
);

-- La veille lit les relevés et les prévisions, et tient son journal. Elle se
-- connecte avec son propre rôle : le collecteur, lui, reste en écriture seule.
do $$
begin
  if not exists (select from pg_roles where rolname = 'meteo_veille') then
    create role meteo_veille nologin;
  end if;
end
$$;

grant usage on schema meteo to meteo_veille;
grant select on meteo.releves, meteo.previsions to meteo_veille;
grant select, insert on meteo.nuits_gel to meteo_veille;
-- Le soir s'écrit une fois ; ensuite, seuls l'envoi et le bilan du matin
-- complètent la ligne. `chauffee` se renseigne depuis l'app, pas d'ici.
grant update (
  envoyee_le, min_exterieur, min_veranda, erreur_prevision, erreur_modele,
  bilan_le
) on meteo.nuits_gel to meteo_veille;
