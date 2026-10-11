# Freshour — Pricing & Quotation Operating System

Freshour is a production web application for a fresh-pork factory's weekly
pricing cycle: factory cost → margin rules → Central Price → Customer Price →
Sales quote → customer response/negotiation → closed deal → posted invoice →
Executive reporting. The goal is to remove repetitive manual work from
Pricing/Sales/Executive so people spend their time reviewing exceptions and
approving decisions, not re-entering the same numbers in spreadsheets.

See `docs/Freshour_ClaudeCode_Production_MasterPrompt_v2.md`-equivalent
business spec is reflected across `docs/*.md` below; this README is the
practical "how do I run this" guide.

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- PostgreSQL + Prisma
- Argon2id password hashing + signed, httpOnly session cookies (no third-party auth SaaS)
- Server-side RBAC (EXECUTIVE / PRICING / SALES / ADMIN) enforced in both edge middleware and every server action/query
- Vitest (unit + integration), Playwright (E2E)
- Docker + docker-compose

## Quick start (local, with Docker)

```bash
cp .env.example .env
# edit .env: set AUTH_SECRET to a long random value (openssl rand -base64 48)
docker compose up --build
```

This starts PostgreSQL, runs `prisma migrate deploy`, and starts the app on
`http://localhost:3000`. On a fresh database there is no seed data yet — run
the bootstrap seed once the containers are up. The `app` service is a
pruned production image with no dev tooling in it, so seeding runs via the
`seed` profile (built from the same Dockerfile's full `builder` stage):

```bash
docker compose run --rm seed
```

The seed:
- creates 4 dev-only login accounts (`exec@freshour.dev`, `pricing@freshour.dev`,
  `sales@freshour.dev`, `admin@freshour.dev`, password `Freshour2026!` — **rotate
  these before any real deployment**), marked `DATA_ORIGIN = DEV_FIXTURE`;
- creates the initial Margin Policy (global floor 12%, category targets per
  `docs/BUSINESS_RULES.md`) — this is a business rule, **not** derived from
  the source PDF;
- imports the real Freshour source PDF data from `data/imports/*.source.json`
  (see `docs/SOURCE_DATA_EXTRACTION_REPORT.md`) if present, publishing the
  initial Cost Snapshot + Source Price Snapshot and opening the first Pricing
  Round.

## Local development without Docker

You need a real PostgreSQL instance (Docker Desktop, a cloud dev DB, or
`postgres` installed locally).

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL + AUTH_SECRET
npx prisma migrate deploy
npm run seed
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest, no DB required) |
| `npm run test:integration` | Integration tests (Vitest, **requires** `DATABASE_URL`) |
| `npm run test:e2e` | Playwright E2E (**requires** a running app + seeded DB) |
| `npm run seed` | Run `prisma/seed.ts` |

## Repository layout

```
src/app/            Next.js routes (one folder per page/role area)
src/lib/domain/      Pure, unit-tested business logic (margin, pricing goals,
                     negotiation, public DTO stripping, invoice GP, RBAC,
                     PDF numeric normalization)
src/lib/queries/     Prisma read queries used by server components
src/lib/auth/        Password hashing, session signing/verification, RBAC guards
src/components/ui/   Design system components
prisma/schema.prisma Full data model
prisma/migrations/   SQL migrations (generated + verified against a real
                     Postgres-wire-protocol database — see docs/TEST_RESULTS.md)
prisma/seed.ts       Bootstrap seed (dev fixtures + real PDF import)
prisma/importSourceData.ts  Repeatable PDF/CSV source import pipeline
data/imports/        Verified extracted source data (JSON)
tests/unit/          Pure-function unit tests (no DB)
tests/integration/   DB-backed invariant tests
tests/e2e/           Playwright E2E specs
docs/                Architecture, data model, business rules, security, etc.
```

## Important: no fake data

Market/competitor prices, Executive revenue, invoices, AR, and payments are
never fabricated. Where no real source exists yet, the UI explicitly says so
(`Market source: NOT CONNECTED`, `No production data yet`) instead of
inventing a believable number. See `docs/BUSINESS_RULES.md` and
`docs/SECURITY.md` for the specifics.

## Status / known gaps

See `docs/V29_PRODUCTION_GAP_AUDIT.md` and `docs/TEST_RESULTS.md` for an
honest account of what has been built, what was verified against a real
database in this environment, and what remains as follow-up work (most
notably: a live market-data connector, and a real e-Today accounting
integration — both intentionally shipped as "NOT CONFIGURED" rather than
mocked).
