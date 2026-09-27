-- Reproduces the roles a Neon project gives us, so local development trips
-- over the same permissions as production.
--
-- ⚠️ The point of this file: a superuser — and a table owner — BYPASS row-level
-- security. Connecting as `postgres` would make every RLS policy look correct
-- locally while a real leak waits in production. The app never connects as a
-- superuser here, exactly as it cannot on Neon.

-- Owner of the database and of every migrated object, like Neon's
-- `neondb_owner`: can create roles and databases, but is not a superuser.
CREATE ROLE neondb_owner LOGIN PASSWORD 'housemate-local' CREATEDB CREATEROLE;

-- The two request roles of Neon's Data API. Policies target them; they never
-- log in directly.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anonymous NOLOGIN;
GRANT authenticated, anonymous TO neondb_owner;

CREATE DATABASE neondb OWNER neondb_owner;

\connect neondb

-- Creating an extension needs a superuser, which is why it happens here and not
-- in a migration. On Neon the extension is provided by the platform.
CREATE EXTENSION pg_session_jwt;

GRANT USAGE ON SCHEMA auth TO authenticated, anonymous;
