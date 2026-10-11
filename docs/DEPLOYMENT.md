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
docker compose run --rm seed   # first deploy only
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

## Deploying for your team (shared URL, no local Mac needed)

The fastest path to a real shared `https://` URL without managing a VM is a
platform that builds straight from this repo's `Dockerfile` and offers a
managed Postgres add-on — e.g. **Railway** (railway.app) or **Render**
(render.com). Steps for Railway:

1. Push this repo to GitHub if it isn't already (it is — see the branch
   this was delivered on).
2. In Railway: **New Project → Deploy from GitHub repo** → pick this repo
   and the `claude/pork-pricing-system-71pozq` branch. Railway detects the
   `Dockerfile` automatically.
3. **New → Database → PostgreSQL** in the same project. Railway creates it
   and exposes a `DATABASE_URL`-shaped connection string you can reference.
4. On the app service → **Variables**, set:
   - `DATABASE_URL` → reference the Postgres service's connection variable
     (Railway's UI lets you pick it from a dropdown rather than typing it)
   - `AUTH_SECRET` → a long random value (generate one locally with
     `openssl rand -base64 48` and paste it in)
   - `APP_BASE_URL` → the public domain Railway gives the app (next step)
5. On the app service → **Settings → Networking → Generate Domain**. You
   now have a public `https://....up.railway.app` URL. Put that same value
   into `APP_BASE_URL` and redeploy.
6. The image's `CMD` runs `prisma migrate deploy` automatically on every
   boot, so the schema is already set up. Seed it once from your own Mac
   (reusing the Docker setup from the quick-start guide), pointing at
   Railway's database instead of your local one:
   ```bash
   DATABASE_URL="<paste Railway's Postgres connection string>" \
     docker compose run --rm seed
   ```
7. Share the `https://....up.railway.app` URL with the team and rotate the
   dev-fixture passwords (see below) before anyone outside the core team
   gets the link.

This also works on Render with the equivalent steps (Web Service from
Dockerfile + a managed Postgres instance + the same environment variables).

## Health check

`GET /login` returns 200 when the app and its DB connection are healthy
(it queries the current session). `docker-compose.yml`'s `db` service has
its own `pg_isready` healthcheck that the `app` service depends on.
