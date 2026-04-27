# Worker image — built with Railway Root Directory = `worker`, so the build
# context is just the `worker/` folder (no access to repo-root package.json
# or the npm workspace). Install worker's deps standalone from its own
# package.json. Workspace-shared packages would not resolve here, so keep
# worker/package.json self-sufficient (all deps must be public npm packages).
FROM node:20-slim

# Pin yt-dlp + invalidate this layer when the date below is bumped. Instagram
# ships breaking changes to its feed endpoints every 1–2 weeks; yt-dlp ships a
# fix shortly after. Without a cachebust, Railway reuses this layer forever and
# the worker silently rots into "DOWNLOAD_FAILED" on every reel.
ARG YTDLP_CACHEBUST=2026-04-27
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp \
    && yt-dlp --version

WORKDIR /app

# Install all deps (incl dev) so `tsc` is available for the build step.
# No package-lock.json at this level — the lockfile lives at the monorepo
# root and is not part of this build context. `npm install` resolves from
# package.json directly; the runtime image is rebuilt on every deploy so
# version drift is bounded by the cachebust + the package.json ranges.
COPY package.json ./
RUN npm install

# Bring in source and compile TypeScript → dist/.
COPY . .
RUN npm run build

# Trim dev deps to slim the runtime layer (typescript / tsx / @types).
RUN npm prune --omit=dev

CMD ["node", "dist/index.js"]
