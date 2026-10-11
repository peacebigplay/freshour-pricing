# Changelog

## 0.2.0 — Full V29 feature-parity pass

- Design system rebuilt to match V29's exact visual language (colors,
  radii, icon-led sidebar, avatar "who" pill, float CTA cards, SVG donut/
  bar/column/sparkline charts) while keeping every page DB-backed.
- Executive dashboard rebuilt around V29's Priority 01–06 structure with
  real Actual YTD performance, Cash/AR aging, Prospect health, Delivery/
  carrier scorecards, and Customer Issues summary — all computed from real
  rows, no fixture data.
- New real, DB-backed features ported from V29 (see
  `docs/V29_PRODUCTION_GAP_AUDIT.md` for the full table): `Prospect`,
  `Carrier`/`Delivery`, `CustomerIssue` (Sales log/close UI at
  `/sales/issues`), `PriceRequest` ("ขอปรับราคา" workflow: Sales/Pricing
  request, Pricing approves/rejects at `/pricing/requests`), `Invoice.dueDate`
  + AR aging buckets.
- `/customers` rebuilt as a real Margin Guard contract view: per-customer
  grade (A–F, computed from real margin states), loss/thin/ok banding,
  grade filter, and the "ขอปรับราคา" action wired to a real `PriceRequest`.
- Closed two real functional gaps the Margin Guard view exposed: there was
  previously no way to create a `Customer` at all, and nothing ever
  created a `CustomerPriceSheet`/`CustomerPriceLine` — both now have real
  actions (`/customers` "+ ลูกค้าใหม่", `/pricing` "สร้าง/อัปเดตชีทราคาลูกค้า").
- 9 new unit tests (customer grading, customer price suggestion) — 53
  unit tests total, all green.

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
