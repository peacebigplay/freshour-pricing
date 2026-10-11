# Business Rules

These are the production rules actually implemented in `src/lib/domain/` and
exercised by `tests/unit/`. The in-app **Principles** page
(`src/app/principles/page.tsx`) renders the live `MarginPolicyVersion` row
these numbers come from — if you change the seeded policy, that page (and
this doc) should agree with the database, not the other way around.

## Margin policy (`src/lib/domain/margin.ts`)

- **Global floor:** 12% — no SKU, customer, or negotiation may go below this,
  ever.
- **Default category targets:**
  | Category | Target |
  |---|---|
  | Competitive / highly competitive cuts | 12% |
  | Popular / high-demand cuts | 20% |
  | Offal | 40% |
  | Other | 15% |
- **SKU-specific override:** a `SkuCategoryOverride` row may set a different
  target for one product under the active `MarginPolicyVersion`.
- **Effective target:**
  ```
  effective_target_pct = max(global_floor_pct, resolved_category_target_pct)
  ```
  where `resolved_category_target_pct` is the SKU override if one exists,
  else the category's target.
- **Margin:** `margin_pct = ((selling_price - current_cost) / selling_price) * 100`
- **Margin Guard price:** `ceil(current_cost / (1 - effective_target_pct / 100))`
  — the lowest price that still clears the effective target, rounded up so
  it never under-protects margin.

These numbers are a **business rule**, not something extracted from the
source PDF — the PDF has no margin-target columns. `prisma/importSourceData.ts`
never writes to `MarginPolicyVersion`; only `prisma/seed.ts` does, explicitly.

## Pricing Goals (`src/lib/domain/pricingGoals.ts`)

For each Central Pricing line, Pricing can choose between:
- **Hold** — keep the previously approved price (flagged if it has drifted
  below the floor since).
- **Target** — price exactly at the effective target margin (the Guard
  price).
- **Protect** — Guard price + 3%, a buffer against near-term cost movement.
- **Competitive** — match the lowest verified market reference, but never
  below the global-floor guard price. Only offered when a real Market
  Snapshot exists; never invented.

## Negotiation (`src/lib/domain/negotiation.ts`)

```
supplier_max_cost = proposed_selling_price * (1 - effective_target_pct / 100)
```
The highest supplier cost Pricing could accept while still holding the
effective target margin at the customer's proposed price. Shown to Pricing
on the shared `NegotiationCase`, never to the customer.

## Invoice / Executive financial boundary (`src/lib/domain/invoiceFinancials.ts`)

- `line_gp = line_net_sales - recognized_cost_total`. If `recognizedCost` is
  unresolved, the line's GP is `null` (`COST_PENDING`) — **never** a
  fallback of `invoice_total * fixed_margin_percent`.
- `Actual Revenue = sum(net_sales)` over invoice lines whose invoice status
  is `POSTED`. A `Quote` total, a `ClosedDeal` total, and a `STAGED` invoice
  are explicitly **not** revenue.
- A closed deal does not, by itself, create or post an invoice — it creates
  a `FinancialHandoff` (status `PENDING`) that a separate reconciliation
  step (CSV fallback or future e-Today integration) must match to a real
  invoice before anything reaches `POSTED`.

## Data provenance

Every `Product`, `CostSnapshot`, and `SourcePriceSnapshot` carries
`dataOrigin: REAL_SOURCE | DEV_FIXTURE`. Production seed data is
`REAL_SOURCE` (the verified PDF import); only the 4 login accounts are
`DEV_FIXTURE`. No fake market price, revenue, invoice, AR, or Sales pipeline
event is ever seeded — those pages show an explicit empty state
("No production data yet" / "Market source: NOT CONNECTED") instead.
