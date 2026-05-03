# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Atletico Intelligence — Next.js frontend container.
#
# Three stages:
#   1. deps     — install pnpm packages once, cached across code changes
#   2. builder  — produce a Next.js standalone build (output: 'standalone')
#   3. runner   — minimal alpine image that just runs `node server.js`
#
# NEXT_PUBLIC_* env vars must be present at *build* time because Next.js
# inlines them into the client bundle. They are accepted as build args here.
# Server-only secrets (SUPABASE_SERVICE_ROLE_KEY, AI_SERVICE_URL) are read
# at runtime from the container environment.
# ---------------------------------------------------------------------------

# ----- 1. deps ------------------------------------------------------------
FROM node:20-alpine AS deps

# Alpine doesn't ship with libc6-compat by default; some npm modules need it.
RUN apk add --no-cache libc6-compat

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ----- 2. builder ---------------------------------------------------------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# ----- 3. runner ----------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone server, the static assets, and public files.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
