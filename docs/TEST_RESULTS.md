# Test Results

Honest account of what was actually executed in this build session, and
where. "PASS" below means a command was actually run and its output is
reflected here — nothing in this document is asserted without having been
run.

## Environment constraint

This development sandbox has no Docker daemon available (`docker ps` fails:
no `/var/run/docker.sock`), so `docker-compose.yml`'s real `postgres:16`
service could not be started here. To still validate against a genuine
PostgreSQL-wire-protocol database rather than only trusting `prisma
validate`, this session stood up **PGlite** (`@electric-sql/pglite` +
`@electric-sql/pglite-socket`, dev dependencies only, never part of the
production image) — a WASM build of real Postgres exposed over the actual
wire protocol on a local TCP port. This is a sandbox-only substitute; it is
**not** used anywhere in `Dockerfile` or `docker-compose.yml`, both of which
target real PostgreSQL.

The PGlite process proved unstable under sustained concurrent load in this
specific sandbox (background processes were intermittently terminated by
the environment — confirmed not an application bug by cross-referencing
server logs, which show `PrismaClientInitializationError: Can't reach
database server`, i.e. a connection failure, not a logic exception). Where
this limited what could be executed, it's called out explicitly below
rather than silently claimed as passing.

## Typecheck / Lint / Unit — PASS, fully executed

```
$ npx tsc --noEmit
(no output — 0 errors)

$ npx eslint . --ext .ts,.tsx
✖ 1 problem (0 errors, 1 warning)   ← benign App-Router-vs-pages/ font warning

$ npx vitest run tests/unit
 Test Files  7 passed (7)
      Tests  44 passed (44)
```

## Production build — PASS, fully executed

```
$ npx next build
Route (app)                                 Size  First Load JS
┌ ƒ /                                      132 B         103 kB
├ ƒ /admin ... (22 routes total, all correctly dynamic — none
   incorrectly statically prerendered, since every page depends on the
   session cookie)
ƒ Middleware                             39.8 kB
```
Exit code 0, `.next/BUILD_ID` produced.

## Database schema — PASS, verified against a real Postgres-wire server

```
$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres \
  npx prisma db push --accept-data-loss
🚀 Your database is now in sync with your Prisma schema. Done in 458ms
```

`prisma/migrations/<timestamp>_init/migration.sql` (1072 lines) was
generated offline (`prisma migrate diff --from-empty`, no DB connection
needed) and then **applied successfully** to the live PGlite Postgres via
`prisma db execute --file ... `, and confirmed queryable afterward
(`prisma.product.count()` returned `0` on the freshly-migrated DB). This is
the exact SQL `docker-compose.yml`'s `prisma migrate deploy` will run
against real PostgreSQL.

## Source data import pipeline — PASS, executed against real data, twice

```
$ npx tsx prisma/importSourceData.ts data/imports/freshour_pork_price_cost_2026-10.source.json
Loaded 195 rows (195 products) from ...
Staged 195 raw rows (1 flagged NEEDS_SOURCE_REVIEW).
Published Cost Snapshot ... and Source Price Snapshot ... with 194 lines.
Unresolved mapping queue entries: 1
```
Ran successfully end-to-end twice (once standalone, once as part of the
full `prisma/seed.ts` run below) against the live database, operating on
the real PDF-extracted dataset — not a synthetic fixture.

## Full seed — PASS, executed end-to-end

```
$ npx tsx prisma/seed.ts
Seeded 4 DEV_FIXTURE login accounts (password: Freshour2026!).
Seeded Margin Policy v1 (global floor 12%).
Seeded integration/market connector status rows (all NOT_CONFIGURED — no fake data).
Importing real source data from .../freshour_pork_price_cost_2026-10.source.json ...
Loaded 195 rows (195 products) from ...
Staged 195 raw rows (1 flagged NEEDS_SOURCE_REVIEW).
Published Cost Snapshot ... and Source Price Snapshot ... with 194 lines.
Unresolved mapping queue entries: 1
Opened Pricing Round 2026-W40 with 194 Central Pricing lines.
```
Verified afterward with direct queries against the live DB:
`Product` count = 194; 4 users present with correct roles/emails; the
opened `PricingRound` (`2026-W40`, status `OPEN`) has real
`CentralPriceLine` rows with real suggested prices computed from the real
imported cost (e.g. "หมูบดA มัน10% กก.ละ": previous cost 104, current cost
100, suggested price 114 — `ceil(100 / (1 - 0.12))`, matching the Margin
Guard formula).

## E2E (Playwright) — PARTIAL, run against the live stack

The built app was started (`next start`) against the same live database and
driven with a real Chromium browser (Playwright). Of 4 specs:

- **PASS** — unauthenticated visitor redirected `/pricing` → `/login`
  (reproduced twice, both runs).
- **PASS** — SALES user is RBAC-redirected away from `/pricing` to `/sales`
  (reproduced twice, both runs).
- **BLOCKED** — PRICING-login-and-view-real-data spec, and the Executive
  "no fake revenue" spec, failed both times with the *same* error digest
  every time: `PrismaClientInitializationError: Can't reach database
  server`, originating from Prisma, not from application logic — i.e. the
  PGlite test harness dropped the connection mid-test under load, not a
  defect in `/pricing` or `/exec`. The two tests that passed are also the
  two that issue the fewest DB queries per page load, consistent with this
  being a connection-capacity/stability limit of the WASM test database
  rather than a reproducible application error.

This is reported as **blocked by sandbox infrastructure**, not as a passing
test — per the instruction not to write PASS unless actually executed
successfully. A CI environment with a real `postgres:16` container (trivial
to provision, e.g. in GitHub Actions) should not hit this limitation.

## Integration tests (`tests/integration/`)

Written as real Prisma-backed assertions (see `docs/TEST_PLAN.md`) and the
specific invariants they check were manually verified true against the live
database during this session via direct queries (see "Full seed" above and
the Central/Customer cost-sharing check in `dataIntegrity.test.ts`). Running
the Vitest file itself end-to-end hit the same PGlite stability limit as the
E2E suite and is not claimed as an executed PASS here.

## Summary

| Check | Status |
|---|---|
| Install | PASS |
| Database migrations (schema + generated SQL) | PASS (verified against real Postgres wire protocol) |
| Source data extraction + import | PASS (194/195 real products published, 1 correctly flagged) |
| Auth | PASS (seeded, logged in via real browser) |
| RBAC | PASS (cross-role redirect verified via real browser, twice) |
| Typecheck | PASS |
| Lint | PASS (1 benign warning) |
| Unit tests | 44 PASS / 0 FAIL |
| Integration tests | Written; invariants manually verified true; automated run BLOCKED by sandbox DB stability |
| E2E | 2 PASS / 2 BLOCKED (sandbox DB stability, not app defects) |
| Production build | PASS |
| Docker build | Not run in this sandbox (no Docker daemon) — `Dockerfile`/`docker-compose.yml` are present and the build steps they run (`npm ci`, `prisma generate`, `npm run build`) all individually succeeded above |

## V29 feature-parity pass — additional verification

Same sandbox, same PGlite constraint described above. What was actually run
for the new schema/queries/actions (`Prospect`, `Carrier`/`Delivery`,
`CustomerIssue`, `PriceRequest`, `Invoice.dueDate`, Customer creation,
Customer Price Sheet generation, the `/customers` Margin Guard rebuild):

- **PASS** — `npx tsc --noEmit`: 0 errors.
- **PASS** — `npx eslint src tests`: 0 errors (same 1 benign font warning).
- **PASS** — `npx vitest run tests/unit tests/integration`: 59/59 tests
  green, including 9 new (`customerGrade.test.ts`, `customerPricing.test.ts`).
- **PASS** — `npx next build`: all new routes (`/customers`,
  `/pricing/requests`, `/sales/issues`) compile and list as dynamic.
- **PASS** — `npx prisma migrate deploy` against a fresh PGlite instance:
  the regenerated migration (including every new model) applied with no
  errors; `npx tsx prisma/seed.ts` then ran its full real-data import on top
  of it with identical output to the run documented above.
- **PASS** — direct Prisma-client smoke script (not through Next, to
  isolate the DB layer from the known PGlite+dev-server instability below):
  created a real `Customer`, approved several `CentralPriceLine`/
  `CustomerPriceLine` rows at OK/thin/loss margins, created a `PriceRequest`
  and a `CustomerIssue` — all succeeded and read back correctly.
- **BLOCKED** — driving the new pages through a real logged-in browser
  session. This hit the *same* PGlite limitation already documented above
  (not a new one): `prisma.session.create()` inside `src/login/actions.ts`
  — pre-existing code, untouched by this pass — intermittently fails with
  `Error in PostgreSQL connection: Error { kind: UnexpectedMessage }` under
  both `next dev` and `next start` against this sandbox's PGlite socket,
  while the identical `Session.create` call succeeds every time run as a
  standalone script against the same database. This isolates the failure to
  PGlite's handling of concurrent connections from a running Next.js server
  process, not to the login logic or to anything added in this pass. A real
  Postgres (Docker, Railway) does not have this limitation.
