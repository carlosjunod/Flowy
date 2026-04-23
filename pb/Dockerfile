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
# Migrations are copied into the working directory the base image expects.
COPY pb_migrations /pb/pb_migrations
