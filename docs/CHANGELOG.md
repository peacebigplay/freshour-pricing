# Changelog

## 0.1.0 — Initial production build

- Full PostgreSQL schema (60+ models) covering product master, cost/price
  snapshots, margin policy, pricing rounds, central/customer pricing,
  quotes, public quote tokens, negotiation, closed deals, financial
  handoff, invoices/reconciliation, executive decisions, audit, and
  integration status.
- Argon2id + signed-session authentication; server-side RBAC for
  EXECUTIVE / PRICING / SALES / ADMIN enforced in both edge middleware and
  every Server Action.
- Pure, unit-tested domain logic: margin/guard formulas, pricing goal
  suggestions, negotiation supplier-cost math, public quote DTO stripping,
  invoice gross-profit, PDF numeric normalization (44 unit tests).
- Real extraction of the source PDF
  (`ใบราคาขาย+ทุน หมูอนามัย AL 01-07.10.69.pdf`) into
  `data/imports/freshour_pork_price_cost_2026-10.source.json`
  (195 records: 192 bulk + 3 frozen, 1 flagged for manual review) with a
  full extraction report.
- Repeatable PDF/CSV source import pipeline publishing an immutable Cost
  Snapshot + Source Price Snapshot per run, with unresolved-mapping
  blocking per Section 11.
- Design system (tokens + reusable components) and pages for Executive,
  Pricing (dashboard + dense Central Pricing table), Customers/Customer
  Pricing, Sales (dashboard, quote send, close deal), public quote,
  Negotiation, Cost & Market, Product Master, Margin Guard, Summary,
  Process, Memory, Principles, Admin (users, integrations, invoice
  CSV-fallback import + posting + reconciliation).
- Dockerfile + docker-compose.yml (Postgres + app, `prisma migrate deploy`
  on startup) and a generated, verified-against-real-Postgres initial SQL
  migration.
- Test suite: 44 unit tests, DB-backed integration tests, Playwright E2E
  specs — see `docs/TEST_RESULTS.md` for exactly what ran where.
