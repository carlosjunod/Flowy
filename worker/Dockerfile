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

COPY package.json package-lock.json ./
COPY worker/package.json ./worker/
RUN npm install --workspace worker --omit=dev --ignore-scripts

COPY worker ./worker

WORKDIR /app/worker
RUN npm run build || true

CMD ["node", "dist/index.js"]
