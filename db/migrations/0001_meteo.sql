-- Collecteur météo (SPEC § 12.7, protocole du banc d'essai § 6).
--
-- La collecte reste bête et régulière : on stocke ce qu'on lit, horodaté, et
-- toute l'intelligence (minimum de la nuit, erreur de prévision, modèle de
-- véranda) appartient à l'analyse. Aucune colonne calculée ici.

create schema meteo;

-- Un relevé de capteur. Le capteur est désigné par son RÔLE, jamais par son
-- identifiant matériel : l'identifiant est une adresse de l'appareil, il reste
-- dans la configuration du collecteur et hors d'un dépôt public.
create table meteo.releves (
  capteur text not null check (capteur in ('exterieur', 'veranda')),
  -- L'instant de la lecture. L'API SwitchBot ne date pas ses valeurs : c'est
  -- l'heure de l'appel, à quelques secondes près de celle de la mesure.
  instant timestamptz not null,
  temperature numeric(4, 1) not null,
  humidite smallint check (humidite between 0 and 100),
  -- `api` pour le sondage, `import` pour un export CSV rejoué (SPEC § 12.7).
  origine text not null check (origine in ('api', 'import')),
  primary key (capteur, instant)
);

-- Une valeur de prévision horaire, telle qu'annoncée à un instant donné.
--
-- ⚠️ `recuperee_le` est la clé de l'honnêteté du banc d'essai : une prévision
-- se juge sur ce qu'elle annonçait AVANT l'événement. Relire après coup une
-- version révisée reviendrait à se donner une bonne note.
create table meteo.previsions (
  source text not null check (source in ('open-meteo', 'met-norway')),
  modele text not null,
  recuperee_le timestamptz not null,
  -- L'émission déclarée par la source quand elle la donne (Met Norway), pour
  -- distinguer un vieux calcul resservi d'un calcul frais.
  emise_le timestamptz,
  cible timestamptz not null,
  temperature numeric(4, 1) not null,
  primary key (source, modele, recuperee_le, cible)
);

-- Le collecteur n'a besoin que d'écrire dans ces deux tables. Il se connecte
-- avec un rôle membre de celui-ci, et rien d'autre en production ne lui est
-- accessible : ni lecture, ni les futures tables du foyer.
do $$
begin
  if not exists (select from pg_roles where rolname = 'meteo_ecriture') then
    create role meteo_ecriture nologin;
  end if;
end
$$;

grant usage on schema meteo to meteo_ecriture;
grant insert on meteo.releves, meteo.previsions to meteo_ecriture;
