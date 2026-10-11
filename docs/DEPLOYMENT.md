# Deployment Guide

## Prerequisites
- A PostgreSQL 14+ instance (managed service, or `docker-compose`'s `db`
  service)
- Node.js 20+ if deploying outside Docker
- A long random `AUTH_SECRET` (`openssl rand -base64 48`)

## Docker (recommended)

```bash
cp .env.example .env
# edit .env — AUTH_SECRET, APP_BASE_URL (public URL customers will see in
# quote links), and DATABASE_URL if not using the bundled db service
docker compose up --build -d
docker compose exec app npx tsx prisma/seed.ts   # first deploy only
```

`docker-compose.yml`'s `app` service runs `prisma migrate deploy` on
startup, applying `prisma/migrations/*` in order — it never runs
`prisma db push` or `migrate dev` in production (those are dev-only tools
that can silently drop columns).

## Bare-metal / VM

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run seed        # first deploy only
NODE_ENV=production npx next start -p 3000
```

Put a reverse proxy (nginx/Caddy) in front for TLS termination; set
`APP_BASE_URL` to the externally-reachable HTTPS URL so public quote links
(`/q/:token`) are generated correctly.

## Environment variables

See `.env.example` for the full list. At minimum: `DATABASE_URL`,
`AUTH_SECRET`. `SESSION_TTL_SECONDS` and `APP_BASE_URL` have sane defaults.

## Rotating the dev-fixture accounts

The seed creates 4 `DATA_ORIGIN = DEV_FIXTURE` login accounts with a shared
known password. Before exposing a deployment beyond trusted internal
testing, either delete these rows or change their passwords through
`/admin/users` (which issues a fresh random temporary password per user).

## Zero-downtime migrations

`prisma migrate deploy` applies pending migrations idempotently and is safe
to run as part of every deploy (`docker-compose.yml` already does this on
container start). For a destructive schema change (column drop/rename),
follow the standard expand-migrate-contract pattern across two deploys
rather than a single breaking migration.

## Health check

`GET /login` returns 200 when the app and its DB connection are healthy
(it queries the current session). `docker-compose.yml`'s `db` service has
its own `pg_isready` healthcheck that the `app` service depends on.
