FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app

COPY package.json package-lock.json ./
COPY worker/package.json ./worker/
RUN npm install --workspace worker --omit=dev --ignore-scripts

COPY worker ./worker

WORKDIR /app/worker
RUN npm run build || true

CMD ["node", "dist/index.js"]
