#!/usr/bin/env bash
#
# Proves the local database reproduces the three Neon behaviours that hide real
# bugs when they are missing: RLS actually enforced for the app's roles,
# `auth.user_id()` from pg_session_jwt, and session state lost across
# transactions behind the pooler.
#
# Runs in a throwaway schema and leaves nothing behind.
set -euo pipefail

readonly POOLED="postgres://neondb_owner:housemate-local@127.0.0.1:56432/neondb"
readonly DIRECT="postgres://neondb_owner:housemate-local@127.0.0.1:55432/neondb"

psql_q() {
  docker compose exec -T postgres psql "$1" -XAtq -v ON_ERROR_STOP=1 -c "$2"
}

# Inside the container, the published ports are the internal ones.
POOLED_IN="${POOLED/127.0.0.1:56432/pgbouncer:6432}"
DIRECT_IN="${DIRECT/127.0.0.1:55432/postgres:5432}"

fail() {
  echo "❌ $1"
  exit 1
}

echo "1. The app role is not a superuser"
is_super=$(psql_q "$DIRECT_IN" "select rolsuper from pg_roles where rolname = current_user")
[ "$is_super" = "f" ] || fail "neondb_owner is a superuser: RLS would be bypassed"
echo "   ✅ neondb_owner is not a superuser"

psql_q "$DIRECT_IN" "
  set client_min_messages = warning;
  drop schema if exists verify cascade;
  create schema verify;
  create table verify.notes (owner text not null, body text not null);
  alter table verify.notes enable row level security;
  create policy own_notes on verify.notes to authenticated
    using (owner = auth.user_id());
  grant usage on schema verify to authenticated, anonymous;
  grant select on verify.notes to authenticated, anonymous;
  insert into verify.notes values ('alice', 'a'), ('bob', 'b');
" >/dev/null

echo "2. RLS through auth.user_id(), via the pooler"
seen=$(psql_q "$POOLED_IN" "
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{\"sub\":\"alice\"}', true);
  select string_agg(owner, ',') from verify.notes;
  commit;" | tail -1)
[ "$seen" = "alice" ] || fail "authenticated as alice saw '$seen'"
echo "   ✅ alice sees only her own row"

anon=$(psql_q "$POOLED_IN" "
  begin;
  set local role anonymous;
  select count(*) from verify.notes;
  commit;" | tail -1)
[ "$anon" = "0" ] || fail "anonymous saw $anon rows"
echo "   ✅ anonymous sees nothing (no policy grants it a row)"

echo "3. The pooler is in transaction mode, hazard included"
# In transaction mode a server connection is handed to the next client as is:
# a claim set for the SESSION (is_local = false) outlives its client and leaks
# to whoever comes next. That is Neon's pooled endpoint too, and it is why the
# app must only ever set the user with is_local = true, inside a transaction.
# Reproducing the leak here is the point: the bug must be catchable locally.
psql_q "$POOLED_IN" \
  "select set_config('request.jwt.claims', '{\"sub\":\"alice\"}', false)" >/dev/null
leak=$(psql_q "$POOLED_IN" "select coalesce(auth.user_id(), '<none>')")
[ "$leak" = "alice" ] || fail "no leak between clients ('$leak'): the pooler is not in transaction mode"
psql_q "$POOLED_IN" "reset all" >/dev/null
echo "   ✅ a session-level claim leaks to the next client, as on Neon"

scoped=$(psql_q "$POOLED_IN" "
  begin;
  select set_config('request.jwt.claims', '{\"sub\":\"alice\"}', true);
  commit;
  select coalesce(auth.user_id(), '<none>');" | tail -1)
[ "$scoped" = "<none>" ] || fail "a transaction-scoped claim survived its transaction ('$scoped')"
echo "   ✅ a transaction-scoped claim does not: that is the safe pattern"

psql_q "$DIRECT_IN" "set client_min_messages = warning; drop schema verify cascade" >/dev/null
echo "All checks passed."
