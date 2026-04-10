FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/object-storage-web/package.json lib/object-storage-web/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/social-playout/package.json artifacts/social-playout/
COPY worker/package.json worker/

RUN mkdir -p artifacts/mockup-sandbox scripts && \
    echo '{"name":"@workspace/mockup-sandbox","version":"0.0.0","private":true}' > artifacts/mockup-sandbox/package.json && \
    echo '{"name":"@workspace/scripts","version":"0.0.0","private":true}' > scripts/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS source
COPY tsconfig.json tsconfig.base.json ./
COPY lib/ lib/
COPY artifacts/api-server/ artifacts/api-server/
COPY artifacts/social-playout/ artifacts/social-playout/
COPY worker/ worker/

FROM source AS build-api
WORKDIR /app/artifacts/api-server
RUN node build.mjs

FROM source AS build-frontend
ENV BASE_PATH=/
ENV PORT=5173
ENV NODE_ENV=production
WORKDIR /app/artifacts/social-playout
RUN npx vite build --config vite.config.ts

FROM source AS build-worker
WORKDIR /app/worker
RUN npx tsc

# --- API Server runtime ---
FROM node:20-slim AS api
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN mkdir -p /data/uploads
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=source /app/lib/ ./lib/
COPY --from=source /app/package.json ./
COPY --from=source /app/pnpm-workspace.yaml ./
COPY --from=source /app/tsconfig.json ./
COPY --from=source /app/tsconfig.base.json ./
COPY --from=source /app/artifacts/api-server/package.json ./artifacts/api-server/
COPY --from=build-api /app/artifacts/api-server/dist ./artifacts/api-server/dist
ENV NODE_ENV=production
ENV UPLOAD_DIR=/data/uploads
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]

# --- Frontend (nginx) ---
FROM nginx:alpine AS frontend
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-frontend /app/artifacts/social-playout/dist/public /usr/share/nginx/html
EXPOSE 80

# --- Worker runtime ---
FROM node:20-slim AS worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app/worker
COPY --from=deps /app/node_modules ../node_modules
COPY --from=deps /app/worker/node_modules ./node_modules
COPY --from=build-worker /app/worker/dist ./dist
COPY --from=source /app/worker/package.json ./
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
