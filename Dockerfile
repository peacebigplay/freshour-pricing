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

# Production runtime: only the pruned "standalone" server output + static
# assets + the Prisma client/schema needed for `prisma migrate deploy` at
# startup. Dev-only tooling (Playwright, ESLint, Vitest, the PGlite test
# harness) never makes it into this image.
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
# Applies any pending migrations, then starts the server. Safe to run on
# every boot (prisma migrate deploy is idempotent) — this is what makes a
# plain `docker run`/"deploy this Dockerfile" on a host like Railway or
# Render correct without that host needing to know about docker-compose's
# separate command override.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node server.js"]
