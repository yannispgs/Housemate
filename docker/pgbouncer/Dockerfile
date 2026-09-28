# Transaction-mode pooler in front of the local Postgres, as Neon's pooled
# endpoint is. Session state — a `SET` without `LOCAL`, a JWT set outside a
# transaction — is lost between transactions here, as it is on Neon. Without the
# pooler, that bug only shows up in production.
#
# Alpine, the smallest base that ships PgBouncer: nothing is compiled here, so
# musl is no concern. `max_prepared_statements` needs PgBouncer >= 1.21; Alpine
# 3.24 ships 1.25. Pinned to an exact version and its multi-architecture index
# digest, like every GitHub Action.

FROM alpine:3.24.2@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

# Unlike Debian's, Alpine's package creates no system user: add one, so the
# pooler does not run as root.
RUN apk add --no-cache pgbouncer \
  && addgroup -S pgbouncer \
  && adduser -S -D -H -G pgbouncer pgbouncer

COPY pgbouncer.ini userlist.txt /etc/pgbouncer/

USER pgbouncer
EXPOSE 6432
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
