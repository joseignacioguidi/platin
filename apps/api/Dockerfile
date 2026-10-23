# Build from the repo root:  docker build -f apps/api/Dockerfile -t platin-api .

# ---------- build ----------
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@10.34.8
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Generates the Prisma client and builds main.js plus a package.json + lockfile with only its dependencies.
RUN NODE_ENV=production NX_DAEMON=false NX_NO_CLOUD=true pnpm nx build api

# ---------- runtime ----------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN npm install -g pnpm@10.34.8 && apt-get update && apt-get install -y --no-install-recommends openssl wget \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/dist/apps/api/package.json /repo/dist/apps/api/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=build /repo/dist/apps/api/main.js ./
COPY apps/api/prisma ./prisma
COPY apps/api/prisma.config.ts apps/api/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/health" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
