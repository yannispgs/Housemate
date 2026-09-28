-- Reproduces the roles a Neon project gives us, so local development trips
-- over the same permissions as production.
--
-- ⚠️ The point of this file: a superuser — and a table owner — BYPASS row-level
-- security. Connecting as `postgres` would make every RLS policy look correct
-- locally while a real leak waits in production. The app never connects as a
-- superuser here, exactly as it cannot on Neon.

-- Owner of the database and of every migrated object, like Neon's
-- `neondb_owner`: can create roles and databases, but is not a superuser.
CREATE ROLE neondb_owner LOGIN CREATEDB CREATEROLE;

-- No `authenticated` / `anonymous` here: a Neon project without the Data API
-- has none either, and migration 0003 creates them. Creating them here once
-- hid a real production failure (the owner lacked the SET right on them).

CREATE DATABASE neondb OWNER neondb_owner;

\connect neondb

-- Creating an extension needs a superuser, which is why it happens here and not
-- in a migration. On Neon the extension is provided by the platform.
CREATE EXTENSION pg_session_jwt;

-- As on Neon (measured 2026-09-28): the `auth` schema is reachable by the
-- database owner ONLY. The request roles get no access to it, and the owner
-- cannot pass it on, so policies reach `auth.user_id()` through SECURITY
-- DEFINER functions owned by the owner (migration 0003).
GRANT USAGE ON SCHEMA auth TO neondb_owner;
