-- Le socle de l'app : foyer, membres, fiches, échéances, complétions.
--
-- La sécurité est ICI, pas dans l'interface (SPEC § 7.1) : chaque table porte
-- ses règles d'accès (RLS), et chaque invariant de la spec est une règle de la
-- base elle-même, qu'aucun bogue de l'app ne peut contourner.
--
-- Rôles : l'app agit avec le rôle `authenticated`, l'utilisateur étant désigné
-- par le jeton de session (auth.user_id(), extension pg_session_jwt) ;
-- `anonymous` n'a accès à rien. Les deux sont créés ici s'ils manquent : sur
-- Neon, seule la Data API les crée, et l'app ne s'en sert pas.
--
-- Le serveur de l'app se connecte en propriétaire, puis endosse `authenticated`
-- dans chaque transaction (`set local role`) pour que la RLS s'applique : il
-- doit pouvoir y basculer (droit SET).
--
-- ⚠️ Mesuré sur Neon le 2026-09-28 : Postgres 16+ donne au créateur d'un rôle
-- l'option ADMIN, mais SANS le droit SET. `pg_has_role(…, 'member')` répond
-- alors vrai et `set role` échoue quand même (« permission denied to set
-- role »). C'est donc bien SET qu'on vérifie, et qu'on s'accorde grâce à
-- l'option ADMIN.
do $$
declare
  role_name text;
begin
  foreach role_name in array array['authenticated', 'anonymous'] loop
    if not exists (select from pg_roles where rolname = role_name) then
      execute format('create role %I nologin', role_name);
    end if;
    if not pg_has_role(current_user, role_name, 'set') then
      execute format('grant %I to current_user with set true', role_name);
    end if;
  end loop;
end
$$;

create schema app;

-- --------------------------------------------------------------------------
-- Foyer et membres
-- --------------------------------------------------------------------------

create table app.foyers (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(trim(nom)) > 0),
  cree_le timestamptz not null default now()
);

-- Un membre du foyer. `auth_user_id` le relie à son compte Neon Auth ; il est
-- vide tant que le membre n'a pas de compte (un enfant, SPEC § 4.1).
create table app.membres (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references app.foyers,
  auth_user_id text unique,
  cree_le timestamptz not null default now()
);

-- La liste blanche (SPEC § 7.2) : une adresse absente ne peut pas créer de
-- compte. Lue par le webhook `user.before_create`, jamais par l'app : aucun
-- droit pour `authenticated`.
create table app.liste_blanche (
  email text primary key check (email = lower(trim(email))),
  foyer_id uuid not null references app.foyers,
  ajoutee_le timestamptz not null default now()
);

-- Le compte, le membre et le foyer de la personne connectée.
--
-- SECURITY DEFINER, pour deux raisons :
-- - lire `membres` sans repasser par sa propre RLS, ce qui bouclerait ;
-- - atteindre `auth.user_id()` : sur Neon, le schéma `auth` appartient à
--   `cloud_admin`, et seul le propriétaire de la base y a accès. Le propriétaire
--   ne peut pas transmettre ce droit (mesuré le 2026-09-28 : le GRANT est sans
--   effet, même Data API activée).
-- `search_path` vide : aucun objet ne peut s'y substituer.
--
-- ⚠️ OBLIGATION DE L'APPELANT. Sur une connexion neuve, si le premier appel à
-- `auth.user_id()` a lieu DANS une fonction SECURITY DEFINER, pg_session_jwt
-- perd l'identité posée par `set_config(…, true)` et renvoie NULL jusqu'à la
-- fin de la transaction — la personne se retrouve sans foyer, sans erreur.
-- Mesuré en local à chaque fois, sur Neon une fois sur huit. Parade mesurée
-- sûre des deux côtés : lire l'identité en propriétaire, dans la même requête
-- que `set_config`, AVANT `set local role authenticated` :
--
--   select set_config('request.jwt.claims', $1, true), auth.user_id();
--   set local role authenticated;
create function app.utilisateur_courant() returns text
  language sql stable security definer set search_path = ''
  as $$ select auth.user_id() $$;

create function app.membre_courant() returns uuid
  language sql stable security definer set search_path = ''
  as $$
    select id from app.membres where auth_user_id = app.utilisateur_courant()
  $$;

create function app.foyer_courant() returns uuid
  language sql stable security definer set search_path = ''
  as $$
    select foyer_id from app.membres
    where auth_user_id = app.utilisateur_courant()
  $$;

-- Un groupe de membres, destinataire possible d'une échéance (« le couple »,
-- SPEC § 3.1). Son nom n'est pas ici : c'est un surnom, comme pour un membre.
create table app.groupes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers
);

create table app.groupe_membres (
  groupe_id uuid not null references app.groupes,
  membre_id uuid not null references app.membres,
  primary key (groupe_id, membre_id)
);

-- Les surnoms dépendent de qui regarde (décision du 25/09/2026) : « moi »
-- pour soi-même — calculé, jamais stocké —, un surnom choisi pour chacun des
-- autres et pour chaque groupe. Des données, pas du code : le dépôt est public.
create table app.surnoms (
  id uuid primary key default gen_random_uuid(),
  observateur uuid not null default app.membre_courant() references app.membres,
  observe_membre uuid references app.membres,
  observe_groupe uuid references app.groupes,
  surnom text not null check (length(trim(surnom)) > 0),
  check (num_nonnulls(observe_membre, observe_groupe) = 1),
  check (observateur <> observe_membre),
  unique nulls not distinct (observateur, observe_membre, observe_groupe)
);

-- --------------------------------------------------------------------------
-- Fiches et échéances
-- --------------------------------------------------------------------------

create table app.fiches (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  nature text not null check (
    nature in (
      'equipement', 'plante', 'vehicule', 'animal', 'contrat',
      'document', 'personne', 'lieu', 'sejour'
    )
  ),
  titre text not null check (length(trim(titre)) > 0),
  categorie text,
  -- Attributs typés, librement ajoutés, retirés, renommés (SPEC § 4.2).
  attributs jsonb not null default '[]' check (jsonb_typeof(attributs) = 'array'),
  -- Masquage ciblé (SPEC § 7) : invisible à ce seul membre.
  masque_pour uuid references app.membres,
  -- Privé strict (SPEC § 7) : visible de son seul auteur.
  prive boolean not null default false,
  cree_par uuid not null default app.membre_courant() references app.membres,
  archivee_le timestamptz,
  cree_le timestamptz not null default now(),
  modifiee_le timestamptz not null default now()
);

create table app.echeances (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  -- Le lien à une fiche est toujours facultatif (SPEC § 2, principe 6).
  fiche_id uuid references app.fiches,
  titre text not null check (length(trim(titre)) > 0),
  categorie text,
  -- Le motif, sous la forme du type `Recurrence` du domaine, validé par Zod à
  -- l'entrée. La base ne vérifie que la forme générale.
  recurrence jsonb not null check (
    jsonb_typeof(recurrence) = 'object' and recurrence ? 'kind'
  ),
  tolerance_jours integer not null default 0 check (tolerance_jours >= 0),
  preavis_jours integer check (preavis_jours >= 0),
  tenue text not null check (tenue in ('souple', 'ferme')),
  importance text not null default 'normal' check (
    importance in ('critique', 'important', 'normal', 'memoire')
  ),
  -- Un membre, un groupe, ou ni l'un ni l'autre : tout le foyer.
  destinataire_membre uuid references app.membres,
  destinataire_groupe uuid references app.groupes,
  -- Vide : le premier qui le fait le coche.
  responsable uuid references app.membres,
  masque_pour uuid references app.membres,
  prive boolean not null default false,
  cree_par uuid not null default app.membre_courant() references app.membres,
  archivee_le timestamptz,
  cree_le timestamptz not null default now(),
  modifiee_le timestamptz not null default now(),
  check (num_nonnulls(destinataire_membre, destinataire_groupe) <= 1)
);

create function app.touche_modifiee_le() returns trigger
  language plpgsql set search_path = ''
  as $$ begin new.modifiee_le = now(); return new; end $$;

create trigger fiches_modifiee_le before update on app.fiches
  for each row execute function app.touche_modifiee_le();
create trigger echeances_modifiee_le before update on app.echeances
  for each row execute function app.touche_modifiee_le();

-- --------------------------------------------------------------------------
-- Complétions — un journal, jamais un état (SPEC § 3.3, § 13.1)
-- --------------------------------------------------------------------------

-- Corriger, c'est ajouter une version ; annuler aussi. Rien ne s'écrase : ni
-- UPDATE ni DELETE ne sont accordés, pour personne d'autre que le propriétaire.
create table app.completions (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  echeance_id uuid not null references app.echeances,
  -- L'occurrence traitée, par sa date due.
  occurrence date not null,
  -- La date RÉELLE du geste, qui peut précéder la saisie (« fait mardi »).
  faite_le date not null,
  auteur uuid not null default app.membre_courant() references app.membres,
  note text,
  -- La version qu'elle corrige, s'il s'agit d'une correction.
  corrige uuid references app.completions,
  -- Une annulation est elle aussi un événement du journal.
  annulee boolean not null default false,
  saisie_le timestamptz not null default now()
);

-- Deux règles qu'une contrainte ne sait pas dire :
-- - on ne complète pas dans le futur, ce serait une prévision (SPEC § 3.3) ;
--   le jour s'entend à Paris, où vit le foyer, et non en UTC ;
-- - une correction corrige une complétion de la MÊME échéance. Vérifié ici et
--   non dans la règle d'accès : une règle sur `completions` qui relirait
--   `completions` boucle (« infinite recursion detected in policy »).
create function app.verifie_completion() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if new.faite_le > (now() at time zone 'Europe/Paris')::date then
      raise exception 'Une complétion ne peut pas être datée du futur (%).', new.faite_le
        using errcode = 'check_violation';
    end if;
    if new.corrige is not null and not exists (
      select from app.completions
      where id = new.corrige and echeance_id = new.echeance_id
    ) then
      raise exception 'Une correction doit viser une complétion de la même échéance.'
        using errcode = 'check_violation';
    end if;
    return new;
  end
  $$;

create trigger completions_verifiees before insert on app.completions
  for each row execute function app.verifie_completion();

-- --------------------------------------------------------------------------
-- Règles d'accès
-- --------------------------------------------------------------------------

alter table app.foyers enable row level security;
alter table app.membres enable row level security;
alter table app.groupes enable row level security;
alter table app.groupe_membres enable row level security;
alter table app.surnoms enable row level security;
alter table app.liste_blanche enable row level security;
alter table app.fiches enable row level security;
alter table app.echeances enable row level security;
alter table app.completions enable row level security;

grant usage on schema app to authenticated;
grant execute on function
  app.utilisateur_courant(), app.membre_courant(), app.foyer_courant()
  to authenticated;

-- Le foyer, ses membres et ses groupes : lecture seule depuis l'app. Les
-- composer relève de l'administration (propriétaire), pas du quotidien.
grant select on app.foyers, app.membres, app.groupes, app.groupe_membres
  to authenticated;
create policy son_foyer on app.foyers for select to authenticated
  using (id = app.foyer_courant());
create policy son_foyer on app.membres for select to authenticated
  using (foyer_id = app.foyer_courant());
create policy son_foyer on app.groupes for select to authenticated
  using (foyer_id = app.foyer_courant());
create policy son_foyer on app.groupe_membres for select to authenticated
  using (groupe_id in (select id from app.groupes));

-- Chacun lit et règle les surnoms qu'IL donne.
grant select, insert, update, delete on app.surnoms to authenticated;
create policy ses_surnoms on app.surnoms for all to authenticated
  using (observateur = app.membre_courant())
  with check (
    observateur = app.membre_courant()
    and (observe_membre is null or observe_membre in (select id from app.membres))
    and (observe_groupe is null or observe_groupe in (select id from app.groupes))
  );

-- Ce qu'une personne voit d'une fiche ou d'une échéance (SPEC § 7) : tout ce
-- qui est à son foyer, sauf ce qui lui est masqué et ce qui est privé à un
-- autre. Une seule définition pour les deux tables et pour la lecture comme
-- pour la modification.
create function app.visible(
  foyer uuid, masque_pour uuid, prive boolean, cree_par uuid
) returns boolean
  language sql stable set search_path = ''
  as $$
    select foyer = app.foyer_courant()
      and masque_pour is distinct from app.membre_courant()
      and (not prive or cree_par = app.membre_courant())
  $$;

-- Une fiche ou une échéance ne peut désigner que des fiches, membres et
-- groupes de son propre foyer. Fonction ordinaire (SECURITY INVOKER) : les
-- sous-requêtes passent par la RLS de la personne connectée, donc ce qui est
-- d'un autre foyer — ou lui est caché — est introuvable.
create function app.references_du_foyer(
  fiche uuid, groupe uuid, membres uuid[]
) returns boolean
  language sql stable set search_path = ''
  as $$
    select (fiche is null or fiche in (select id from app.fiches))
      and (groupe is null or groupe in (select id from app.groupes))
      and not exists (
        select from unnest(membres) as m
        where m is not null and m not in (select id from app.membres)
      )
  $$;

-- Fiches et échéances : DELETE est accordé mais aucune règle ne l'autorise ;
-- une suppression touche zéro ligne et la ligne survit, sans erreur — on
-- n'efface jamais, on archive (SPEC § 4.5, conventions § 11). La
-- modification est accordée colonne par colonne : ni le foyer ni l'auteur ne
-- changent après coup.
grant select, insert, delete on app.fiches, app.echeances to authenticated;
grant update (
  nature, titre, categorie, attributs, masque_pour, prive, archivee_le
) on app.fiches to authenticated;
grant update (
  fiche_id, titre, categorie, recurrence, tolerance_jours, preavis_jours,
  tenue, importance, destinataire_membre, destinataire_groupe, responsable,
  masque_pour, prive, archivee_le
) on app.echeances to authenticated;

create policy lisibles on app.fiches for select to authenticated
  using (app.visible(foyer_id, masque_pour, prive, cree_par));
create policy creables on app.fiches for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and cree_par = app.membre_courant()
    and app.references_du_foyer(null, null, array[masque_pour])
  );
create policy modifiables on app.fiches for update to authenticated
  using (app.visible(foyer_id, masque_pour, prive, cree_par))
  with check (app.references_du_foyer(null, null, array[masque_pour]));

create policy lisibles on app.echeances for select to authenticated
  using (app.visible(foyer_id, masque_pour, prive, cree_par));
create policy creables on app.echeances for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and cree_par = app.membre_courant()
    and app.references_du_foyer(
      fiche_id, destinataire_groupe,
      array[masque_pour, destinataire_membre, responsable]
    )
  );
create policy modifiables on app.echeances for update to authenticated
  using (app.visible(foyer_id, masque_pour, prive, cree_par))
  with check (
    app.references_du_foyer(
      fiche_id, destinataire_groupe,
      array[masque_pour, destinataire_membre, responsable]
    )
  );

-- Complétions : lire et ajouter seulement. Une complétion hérite de la
-- visibilité de son échéance : la sous-requête passe par la RLS des échéances.
grant select, insert on app.completions to authenticated;

create policy lisibles on app.completions for select to authenticated
  using (echeance_id in (select id from app.echeances));
create policy ajoutables on app.completions for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and auteur = app.membre_courant()
    and echeance_id in (select id from app.echeances)
  );

-- `anonymous` : aucun droit, sur rien. `liste_blanche` : aucun droit pour
-- `authenticated` non plus.
