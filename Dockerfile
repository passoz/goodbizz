# syntax=docker/dockerfile:1.7
# Multi-stage image for the goodbizz service (Bun runtime, no model weights, no local inference).

FROM docker.io/oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM docker.io/oven/bun:1.4 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json bunfig.toml drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
RUN bun build src/index.ts --outdir dist --target bun

FROM docker.io/oven/bun:1.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/app/data/app.db \
    GOODBIZZ_STUDIES_DIR=/app/data/estudos \
    APP_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json
# Rasterios da marca (favicon.ico/png, apple-touch-icon): servidos por src/infrastructure/http
# /static.ts a partir de <cwd>/public, e o cwd da imagem e /app.
COPY public ./public
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "dist/index.js"]
