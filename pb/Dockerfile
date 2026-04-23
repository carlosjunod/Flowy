# Flowy PocketBase image.
#
# Build context is this pb/ folder (set Railway service "Root Directory" to pb/).
# A persistent Railway volume MUST be mounted at /pb/pb_data — otherwise the
# SQLite DB and the _migrations tracking table are wiped on every redeploy.
#
# The web + worker JS SDK (pocketbase@^0.26.x) uses the _superusers auth
# collection introduced in PB 0.23, so 0.36.x is fine. If you ever downgrade
# the SDK below 0.22, re-pin PB_VERSION to 0.22.x — the admin auth endpoint
# was removed in 0.23.

FROM alpine:3.19

ARG PB_VERSION=0.36.8

RUN apk add --no-cache unzip ca-certificates

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip

# Bake migrations into the image so every deploy ships the current schema.
# PB applies pending migrations idempotently on startup and tracks them in the
# _migrations table inside data.db.
COPY pb_migrations /pb/pb_migrations

EXPOSE 8080

CMD ["/pb/pocketbase", "serve", \
     "--http=0.0.0.0:8080", \
     "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/pb_migrations", \
     "--publicDir=/pb/pb_public"]
