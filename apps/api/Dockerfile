# Multi-stage Production Dockerfile for @omni-ops/api (NestJS + Prisma + BullMQ)
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @omni-ops/api db:generate
RUN pnpm --filter @omni-ops/shared build
RUN pnpm --filter @omni-ops/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
