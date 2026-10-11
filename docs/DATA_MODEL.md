# Data Model

Full definition: `prisma/schema.prisma`. This is the narrative map of how
the entities connect, grouped the same way the schema file is.

## Identity / RBAC
`User` → `Session` (one row per login; `tokenHash` is the SHA-256 of the
signed JWT cookie, so a stolen JWT alone doesn't let an attacker enumerate
or forge valid session rows from the DB side, and revoking is a single
`UPDATE ... SET revokedAt = now()`).

## Product Master
`Product` is the canonical SKU. `ProductAlias` maps raw source names
("หมูบดA มัน10% กก.ละ") to it. `ProductMappingQueue` holds anything that
couldn't be auto-matched (`UNRESOLVED` → human review in Product Master →
`RESOLVED`, pointing at the real `Product`). Nothing in the pricing or
financial pipeline ever uses a raw source-row id as if it were a product id
— unresolved rows simply don't get a `CostSnapshotLine`.

## Source documents / cost import pipeline
```
SourceDocument (the PDF/CSV itself, stored for audit)
  → CostImportBatch (one import run)
    → CostRawRow (one row per source line, raw + normalized values,
                   extractionStatus OK | NEEDS_SOURCE_REVIEW)
    → CostSnapshot (immutable, published once) → CostSnapshotLine
    → SourcePriceSnapshot (immutable, published once) → SourcePriceSnapshotLine
```
`CostSnapshotLine` and `SourcePriceSnapshotLine` are append-only per import;
a new import creates a new `CostSnapshot`, it never edits a prior one.

## Market data
```
MarketSource (status: CONNECTED | DEGRADED | BLOCKED | NOT_CONFIGURED)
  → MarketRawObservation → MarketMatchReview → MarketSnapshot
```
No row in this chain is ever seeded with a fabricated value — see
`docs/BUSINESS_RULES.md`.

## Margin policy
```
MarginPolicyVersion (global floor, effectiveFrom/To — append-only)
  → MarginCategoryRule (one per MarginCategory)
  → SkuCategoryOverride (one per overridden Product)
```

## Pricing round → Central → Customer
```
PricingRound (pins costSnapshotId + marginPolicyVersionId + optional marketSnapshotId)
  → CentralPriceLine (one per Product; suggestedPrice, approvedPrice,
                       status, version for optimistic locking)
  → CustomerPriceSheet (one per Customer per round)
    → CustomerPriceLine (references its CentralPriceLine — never recomputes
                          cost independently)
  → PricingSalesHandoff (marks a CustomerPriceSheet as handed to Sales)
```

## Quotes / public tokens / negotiation
```
Quote (owned by a Sales user, belongs to a Customer)
  → QuoteRevision (1, 2, 3… — a new row per revision, never edited in place)
    → QuoteLine (references the CustomerPriceLine it came from)
    → QuoteResponse (one per QuoteLine per revision — ACCEPT | NEGOTIATE)
  → PublicQuoteToken (tokenHash unique; the raw token is shown to Sales
                       exactly once at creation and never stored)

QuoteResponse(NEGOTIATE) → NegotiationCase (one shared case Pricing + Sales
                                             both see) → NegotiationEvent*
                                                       → SupplierNegotiation*
```

## Closed deal → financial handoff → invoice → Executive
```
Quote(ACCEPTED) → ClosedDeal → ClosedDealLine (price frozen at close)
                → FinancialHandoff (status PENDING until reconciled)

InvoiceImportBatch → InvoiceRawRow → Invoice (STAGED → POSTED) → InvoiceLine
                                   → ReconciliationException (unmatched
                                     customer/product, duplicate, qty
                                     mismatch)
Invoice(POSTED) → Payment → PaymentAllocation
```
Executive revenue/GP queries (`src/lib/queries/executive.ts`) only ever read
`InvoiceLine` where the parent `Invoice.status === 'POSTED'` — never
`Quote`, `ClosedDeal`, or a `STAGED` invoice.

## Customer relationship / logistics / collections (V29 feature-parity pass)
```
Customer → Prospect (sales pipeline, owned by a User; stage/status)
         → CustomerIssue (logged by Sales, severity LOW|MID|HIGH, OPEN|CLOSED)
         → PriceRequest (a requested raise on one CustomerPriceLine;
                          OPEN → APPROVED | REJECTED by Pricing)

Carrier → Delivery (one per fulfilled ClosedDeal; promisedAt/actualAt/delayMinutes)
       → CustomerIssue (optional carrier attribution, e.g. late delivery)
```
`PriceRequest.status = APPROVED` is the only path, besides the existing
Central/Customer Pricing approval flow, that ever writes
`CustomerPriceLine.approvedPrice` after the line's first approval — it goes
through the same optimistic-locking `version` field.

`Invoice.dueDate` (default `invoiceDate + 30 days`, or taken from the
financial CSV import when present) backs the AR aging buckets on Executive
(`getCashAndAr()`), bucketed off real `POSTED` invoices only — same
POSTED-only rule as the rest of the financial queries below.

## Executive / audit / integrations
`ExecutiveDecision` (the Attention Queue), `AuditEvent` (append-only, every
mutating Server Action writes one), `IntegrationConfig` / `IntegrationRun`
(truthful connector status), `JobRun`, `IntegrityCheckResult`.
