# ================================================================
# Seraph — multi-stage build
# Stage 1: install dependencies
# Stage 2: build the Next.js app
# Stage 3: minimal production image (standalone output)
# ================================================================

FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/seraph-graph-types/package.json packages/seraph-graph-types/package.json
COPY packages/seraph-connector-sdk/package.json packages/seraph-connector-sdk/package.json
COPY packages/wwv-plugin-sdk/package.json packages/wwv-plugin-sdk/package.json
COPY packages/wwv-lib-aviation/package.json packages/wwv-lib-aviation/package.json
COPY packages/wwv-lib-incidents/package.json packages/wwv-lib-incidents/package.json
COPY prisma/ prisma/
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
# public/ must exist for the runner stage; keep it even if the repo
# drops the directory (Next.js tolerates an empty one).
RUN mkdir -p /app/public
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time —
# supplied via fly.toml [build.args] (e.g. the collab WebSocket URL).
ARG NEXT_PUBLIC_WS_SERVER_URL
ENV NEXT_PUBLIC_WS_SERVER_URL=${NEXT_PUBLIC_WS_SERVER_URL}
ARG NEXT_PUBLIC_WWV_EDITION
ENV NEXT_PUBLIC_WWV_EDITION=${NEXT_PUBLIC_WWV_EDITION}
ENV NEXT_TELEMETRY_DISABLED=1
# CesiumJS static assets land in public/cesium for the runner stage.
RUN node scripts/copy-cesium.mjs
RUN pnpm db:generate && pnpm build

FROM node:24-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next
RUN chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
