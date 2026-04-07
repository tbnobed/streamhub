FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package.json ./
RUN npm install -g pnpm && pnpm install

COPY src/ ./src/
COPY tsconfig.json ./

RUN pnpm build

FROM node:22-alpine AS production
WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
