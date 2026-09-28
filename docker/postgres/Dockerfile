# Local Postgres that behaves like Neon for development.
#
# Same major version as the Neon projects, plus `pg_session_jwt` — the
# extension behind Neon RLS that provides `auth.user_id()`. It publishes no
# binaries, so it is compiled here with pgrx and only the built files are copied
# into the final image.

#
# Every image is pinned to its multi-architecture index digest, like every
# GitHub Action: a tag can be repointed, a digest cannot. The version it stands
# for is written just above each FROM.
#
# Debian, not Alpine, for both stages: the extension is compiled against glibc
# and must run on the glibc it was built with, and pgrx does not reliably
# support musl. Both stages therefore share the same Debian release (trixie),
# and the builder is the `slim` variant.

ARG PG_MAJOR=18

# rust:1.98.1-slim-trixie
FROM rust@sha256:4cd829461bd5c4d511c32e269da9cb8929223b666519d8004e35fc8d1d771ab7 AS build
ARG PGRX_VERSION=0.16.1

# What the slim image leaves out and the build needs: git (fetching the
# extension), pkg-config + libssl-dev (cargo-pgrx), clang (bindgen).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates clang curl git gnupg libclang-dev libssl-dev pkg-config \
  && rm -rf /var/lib/apt/lists/*

# The slowest step, and independent of the Postgres version: kept before it so
# a version bump does not recompile it.
RUN cargo install --locked "cargo-pgrx@${PGRX_VERSION}"

# Postgres server headers from the PGDG repository, matching the runtime image.
ARG PG_MAJOR
RUN install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL --proto "=https" --tlsv1.2 \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
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

# The same major as the Neon projects.
# postgres:18.6-trixie
FROM postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722
ARG PG_MAJOR
COPY --from=build /src/target/release/pg_session_jwt-pg${PG_MAJOR}/usr/ /usr/
COPY init/ /docker-entrypoint-initdb.d/

# The official entrypoint starts as root only to hand the data directory to
# `postgres`; the named volume inherits the image's ownership, so it can run as
# `postgres` from the start.
USER postgres
