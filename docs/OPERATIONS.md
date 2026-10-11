# Operations

## Weekly pricing cycle (operator runbook)

1. **New cost file arrives** → an operator (ADMIN) runs the import pipeline
   against the new source file: `npx tsx prisma/importSourceData.ts <path>`
   (or a future upload UI calling the same code path).
2. System stages raw rows, matches products by alias, flags anything
   ambiguous as `NEEDS_SOURCE_REVIEW` → **Product Master** Mapping Queue.
3. PRICING reviews the Mapping Queue (`/product-master`) — this is the one
   mandatory manual step; everything else downstream is blocked until it's
   clear.
4. System publishes the Cost Snapshot + Source Price Snapshot
   (`importSourceData.ts` does this automatically once all rows are either
   matched or routed to review).
5. PRICING opens (or the seed opens automatically) a new `PricingRound`
   pinned to that Cost Snapshot + the current `MarginPolicyVersion`.
6. PRICING reviews **Central Pricing** (`/pricing/central`) — normal lines
   can be bulk-approved; exceptions (below-target margin, large cost swings)
   get individual attention.
7. Once Central Pricing is approved, Customer Pricing sheets
   (`/customers/:id`) become approvable per customer.
8. SALES sends approved sheets to customers (`/sales` → "ส่งราคาให้ลูกค้า"),
   generating a `Quote` + secure public link.
9. Customer responses (accept/negotiate) flow back automatically; a
   `NEGOTIATE` creates one shared `NegotiationCase` PRICING decides on.
10. SALES closes accepted deals (`Close Deal & Send Financial Handoff`).
11. ADMIN reconciles invoices (CSV fallback today — `/admin/invoices`) and
    posts them; only `POSTED` invoices move Executive's Actual Revenue.
12. EXECUTIVE reviews `/exec` — Attention Queue, category margin vs.
    target, pipeline, data health — and records decisions on anything that
    needs one.

## Monitoring what matters

- `/summary` — single-page "where are we, what's blocked, what's next" for
  the current cycle, computed live from the DB (no hard-coded copy).
- `/process` — stage-by-stage counts across the full cost→invoice→executive
  pipeline.
- `/admin/integrations` — connector health; a `BLOCKED`/`DEGRADED` row here
  is the first thing to check if cost/market data looks stale.
- `AuditEvent` (visible on `/memory`) — every approval, mapping resolution,
  quote send, deal close, invoice post, and exception resolution is logged
  with actor + timestamp.

## Database maintenance

- Backups: standard PostgreSQL backup practice (managed-service snapshots,
  or `pg_dump` on a schedule) — not automated inside this repo.
- `AuditEvent`, `CostRawRow`, and `InvoiceRawRow` grow unbounded over time;
  if retention becomes a concern, archive rows older than N cycles rather
  than deleting (they're the audit trail).

## CI (not yet wired up — recommended pipeline)

```
npm ci
npm run typecheck
npm run lint
npm test                    # unit — no DB needed
# with a real Postgres service container:
npx prisma migrate deploy
npm run test:integration
npm run build
npm run test:e2e            # against the built app + seeded DB
```

This build's test suite was actually executed against a real
Postgres-wire-protocol database in the development sandbox (see
`docs/TEST_RESULTS.md`); a CI pipeline should use an actual `postgres:16`
service container (trivial in GitHub Actions / GitLab CI), which will be
materially more stable than the embedded-WASM database used here only
because Docker-based Postgres wasn't available in this sandbox.
