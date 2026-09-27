# Transaction-mode pooler in front of the local Postgres, as Neon's pooled
# endpoint is. Session state — a `SET` without `LOCAL`, a JWT set outside a
# transaction — is lost between transactions here, as it is on Neon. Without the
# pooler, that bug only shows up in production.
#
# Debian's package rather than a third-party image: one maintainer fewer, and it
# exists for arm64. Trixie, because `max_prepared_statements` needs
# PgBouncer ≥ 1.21 and bookworm ships 1.18.
FROM debian:trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends pgbouncer \
  && rm -rf /var/lib/apt/lists/*

COPY pgbouncer.ini userlist.txt /etc/pgbouncer/

USER postgres
EXPOSE 6432
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
