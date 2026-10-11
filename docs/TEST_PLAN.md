# Test Plan

## Unit (`tests/unit/`, `npm test`) — no database required

Pure-function tests for every formula the Master Prompt specifies by name:
- `margin.test.ts` — effective target (floor vs. category vs. SKU override),
  margin %, Margin Guard price (including a property test that the guard
  price always yields ≥ target margin), below-floor/below-target flags.
- `pricingGoals.test.ts` — Hold/Target/Protect always offered, Competitive
  only when a market reference exists and never below the floor guard.
- `negotiation.test.ts` — supplier max cost formula and its monotonicity.
- `publicQuoteDto.test.ts` — the public DTO exposes exactly
  `{productName, unit, price}` and nothing else; a deliberately-leaked field
  is caught by `countInternalFieldsOnPublicDto`.
- `invoiceFinancials.test.ts` — GP is `netSales - recognizedCost` or `null`
  (`COST_PENDING`), never a flat-margin guess.
- `pdfNormalize.test.ts` — Thai-year date parsing, numeric cell
  normalization (blanks/dashes → `null`, not `0`; garbage throws rather than
  silently coercing).
- `rbac.test.ts` — the specific role-boundary claims from Section 7 (SALES
  can't approve prices or edit cost, EXECUTIVE can't publish prices, only
  ADMIN manages users).

## Integration (`tests/integration/`, `npm run test:integration`) — requires `DATABASE_URL`

`dataIntegrity.test.ts` asserts, against real seeded data:
- Every published `CostSnapshotLine` resolves to a real `Product` (never a
  raw row id).
- A row flagged `NEEDS_SOURCE_REVIEW` never reaches a Cost Snapshot and
  stays in the unresolved Mapping Queue.
- Central Pricing and Customer Pricing read the identical `CostSnapshotLine`
  for the same product within a round.
- An unresolved product mapping blocks that product from Central Pricing.
- A Closed Deal never directly creates an Invoice row (the financial import
  pipeline is the only path to one).
- GP on a `POSTED` invoice line is always exactly `netSales -
  recognizedCost`.

## E2E (`tests/e2e/`, `npm run test:e2e`) — requires the built app + seeded DB running

`auth-and-pricing.spec.ts`:
- An unauthenticated visitor hitting `/pricing` is redirected to `/login`.
- A PRICING user logging in lands on `/pricing` and sees a real,
  PDF-derived product name on `/pricing/central`.
- A SALES user is bounced away from `/pricing` back to their own role home
  (RBAC enforced server-side, not just hidden in the nav).
- An EXECUTIVE with no posted invoices sees "No production data yet"
  instead of a fabricated revenue number.

Further E2E coverage called out by Section 38 (customer accept/negotiate on
the public quote, negotiation revision, close deal, financial boundary,
admin source import, audit) is written as real app functionality and
exercised manually against the live database during this build (see
`docs/TEST_RESULTS.md`), but is not yet encoded as additional Playwright
specs — a natural next increment once CI has a stable Postgres service
container.

## What's intentionally not covered

- Load/performance testing.
- Visual regression screenshots (Section 39) — the design system and pages
  exist; automated screenshot diffing against them was out of scope for
  this pass.
