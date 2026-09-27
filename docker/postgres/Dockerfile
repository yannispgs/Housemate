# Local Postgres that behaves like Neon for development.
#
# Same major version as the Neon projects, plus `pg_session_jwt` — the
# extension behind Neon RLS that provides `auth.user_id()`. It publishes no
# binaries, so it is compiled here with pgrx and only the built files are copied
# into the final image.

ARG PG_MAJOR=18

FROM rust:1-bookworm AS build
ARG PGRX_VERSION=0.16.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg libclang-dev clang \
  && rm -rf /var/lib/apt/lists/*

# The slowest step, and independent of the Postgres version: kept before it so
# a version bump does not recompile it.
RUN cargo install --locked "cargo-pgrx@${PGRX_VERSION}"

# Postgres server headers from the PGDG repository, matching the runtime image.
ARG PG_MAJOR
RUN install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends "postgresql-server-dev-${PG_MAJOR}" \
  && rm -rf /var/lib/apt/lists/* \
  && cargo pgrx init "--pg${PG_MAJOR}=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config"

# v0.5.0, pinned by commit like every GitHub Action.
ARG PG_SESSION_JWT_SHA=937a79a65e596d916295d078b3a82ab421291665
WORKDIR /src
RUN git init -q . \
  && git remote add origin https://github.com/neondatabase/pg_session_jwt.git \
  && git fetch -q --depth 1 origin "${PG_SESSION_JWT_SHA}" \
  && git checkout -q FETCH_HEAD \
  && cargo pgrx package --no-default-features --features "pg${PG_MAJOR}" \
    --pg-config "/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config"

FROM postgres:${PG_MAJOR}-bookworm
ARG PG_MAJOR
COPY --from=build /src/target/release/pg_session_jwt-pg${PG_MAJOR}/usr/ /usr/
COPY init/ /docker-entrypoint-initdb.d/
