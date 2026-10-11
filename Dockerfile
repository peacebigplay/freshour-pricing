FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
RUN npx prisma generate
RUN npm run build

# Production runtime. Copies the FULL node_modules from the builder stage
# rather than hand-picking files: Prisma's CLI (prisma migrate deploy) loads
# a WASM-compiled schema engine through its own internal module resolution,
# and a prior attempt at selectively copying only node_modules/prisma +
# node_modules/@prisma + the node_modules/.bin/prisma symlink missed a file
# that resolution needs, causing an ENOENT crash loop in the real deploy
# environment. Copying node_modules wholesale is the simple, reliably
# correct trade: a larger image (dev tooling like Playwright/ESLint/Vitest
# comes along for the ride) in exchange for not re-litigating Prisma's
# internal file layout on every Prisma version bump.
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
# Applies any pending migrations, then starts the server. Safe to run on
# every boot (prisma migrate deploy is idempotent) — this is what makes a
# plain `docker run`/"deploy this Dockerfile" on a host like Railway or
# Render correct without that host needing to know about docker-compose's
# separate command override.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
