-- Prévisions de pluie (SPEC § 12.9 : qui emmène Lexa à la crèche).
--
-- ⚠️ Une pluie n'est pas une température. Une température vaut à un INSTANT ;
-- une pluie est un CUMUL SUR UNE DURÉE, et les sources ne le datent pas
-- pareil : Open-Meteo date la pluie de l'heure écoulée, Met Norway celle de
-- l'heure à venir. D'où une table à part, avec un début et une fin explicites :
-- « 8 h – 9 h » y désigne le même intervalle quelle que soit la source.

create table meteo.previsions_pluie (
  source text not null check (source in ('open-meteo', 'met-norway')),
  modele text not null,
  recuperee_le timestamptz not null,
  emise_le timestamptz,
  debut timestamptz not null,
  fin timestamptz not null,
  precipitation_mm numeric(5, 1) not null check (precipitation_mm >= 0),
  primary key (source, modele, recuperee_le, debut),
  check (fin > debut)
);

grant insert on meteo.previsions_pluie to meteo_ecriture;
