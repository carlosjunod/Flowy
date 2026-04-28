# Worker image — built with Railway Root Directory = `worker`, so the build
# context is just the `worker/` folder (no access to repo-root package.json
# or the npm workspace). Install worker's deps standalone from its own
# package.json. Workspace-shared packages would not resolve here, so keep
# worker/package.json self-sufficient (all deps must be public npm packages).
FROM node:20-slim

# Pin yt-dlp + invalidate this layer when the date below is bumped. Instagram
# ships breaking changes to its feed endpoints every 1–2 weeks; yt-dlp ships a
# fix shortly after. The cachebust value MUST be referenced inside the RUN
# command (echo "$YTDLP_CACHEBUST") — declaring the ARG alone does not
# reliably invalidate the layer under BuildKit. Without that reference,
# Railway reuses this layer forever and the worker silently rots.
ARG YTDLP_CACHEBUST=2026-04-28
RUN echo "yt-dlp cachebust: $YTDLP_CACHEBUST" \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp \
    # Resolve the actual install location pip chose and symlink to a fixed
    # absolute path. pip on Debian-slim normally lands in /usr/local/bin, but
    # we don't want to rely on that — the symlink + ENV YTDLP_PATH below mean
    # the worker calls an absolute path that doesn't depend on $PATH at all.
    && YTDLP_REAL="$(command -v yt-dlp)" \
    && echo "yt-dlp installed at: $YTDLP_REAL" \
    && ln -sf "$YTDLP_REAL" /usr/local/bin/yt-dlp \
    && test -x /usr/local/bin/yt-dlp \
    && /usr/local/bin/yt-dlp --version

# Pin the absolute path the worker will exec. Avoids any ENOENT from PATH
# drift between build-time and runtime layers.
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

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
