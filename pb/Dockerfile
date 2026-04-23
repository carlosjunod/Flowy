# Extend ghcr.io/muchobien/pocketbase with Flowy's migrations baked in.
#
# PINNED to 0.22.x: apps/web/package.json uses pocketbase@^0.21.3, which calls
# POST /api/admins/auth-with-password. PocketBase 0.23 removed that endpoint
# (admin auth moved to /api/collections/_superusers/auth-with-password).
# Bumping the image past 0.22.x without upgrading the SDK will break
# /api/auth/google and /api/auth/apple.
ARG PB_VERSION=0.22.21
FROM ghcr.io/muchobien/pocketbase:${PB_VERSION}

# Build context is this pb/ folder (set Railway service "Root Directory" to pb/).
COPY pb_migrations /pb/pb_migrations

# Override the upstream CMD. The muchobien base declares VOLUME ["/pb_data"]
# and defaults --dir to /pb_data (root-level). On Railway the persistent volume
# is mounted at /pb/pb_data, so the upstream defaults send the SQLite DB to a
# Docker anonymous volume that is wiped every redeploy — users and migration
# state vanish. Pin both paths explicitly to /pb/pb_data (volume mount) and
# /pb/pb_migrations (where the COPY above puts the migration .js files).
EXPOSE 8080
CMD ["/pb/pocketbase", "serve", \
     "--http=0.0.0.0:8080", \
     "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/pb_migrations"]
