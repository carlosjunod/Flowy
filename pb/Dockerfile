# Flowy PocketBase image.
#
# Build context is this pb/ folder (set Railway service "Root Directory" to pb/).
# A persistent Railway volume MUST be mounted at /pb/pb_data — otherwise the
# SQLite DB and the _migrations tracking table are wiped on every redeploy.
#
# PINNED to 0.22.x intentionally — DO NOT BUMP without also:
#   1. Upgrading apps/web + worker `pocketbase` SDK to >= 0.22.x
#      (PB 0.23 removed /api/admins/* → SDK pre-0.22 gets 404s).
#   2. Rewriting every file in pb_migrations/ for the new JS VM API
#      (PB 0.23 removed the `Dao` class and `SchemaField` in favor of
#      `$app` and typed field classes — the existing migrations call
#      `new Dao(db)` and throw "Dao is not defined" on startup).
# Both were silently broken by commit 6fe5d05; this pin restores the
# coherent 0.22.x stack that the migrations were actually written for.

FROM alpine:3.19

ARG PB_VERSION=0.22.21

RUN apk add --no-cache unzip ca-certificates

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip

# Bake migrations into the image so every deploy ships the current schema.
# PB applies pending migrations idempotently on startup and tracks them in the
# _migrations table inside data.db.
#
# CACHEBUST: bump this date when adding a new migration file. Railway re-uses
# the previous layer cache on redeploy, so without an invalidation hint the
# `COPY pb_migrations` step is skipped and new migrations never reach the
# container — even though PB would happily apply them on startup.
ARG CACHEBUST=2026-04-27-mig15
COPY pb_migrations /pb/pb_migrations

EXPOSE 8080

# RESET_DB=1 wipes the data volume once on startup. Use this as an
# escape hatch when the DB schema is from a future PB version that
# cannot be downgraded (e.g. a volume carried over from a prior 0.36.x
# deploy). UNSET this env var immediately after the wipe deploy
# finishes — otherwise every restart nukes your users and data.
CMD sh -c 'if [ "$RESET_DB" = "1" ]; then echo "[pb] RESET_DB=1 set, wiping /pb/pb_data/*"; rm -rf /pb/pb_data/*; fi; exec /pb/pocketbase serve --http=0.0.0.0:8080 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations --publicDir=/pb/pb_public'
