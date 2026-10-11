# Data Lineage

Every Central Price line can answer, from data the schema already stores —
no separate "audit log reconstruction" needed:

```
Product             → CentralPriceLine.productId
Current cost        → CostSnapshotLine.currentCost
                       (via CostSnapshot.id == PricingRound.costSnapshotId)
Cost source          → CostSnapshotLine.sourcePage / sourceRowNo
                       → CostRawRow → CostImportBatch → SourceDocument
Cost effective period → CostSnapshot.effectivePeriodStart/End
Cost snapshot         → CostSnapshot.id
Source selling-price
  references           → SourcePriceSnapshotLine (same productId, same round's
                          SourcePriceSnapshot)
Margin policy version → PricingRound.marginPolicyVersionId
Resolved category     → Product.category (+ SkuCategoryOverride if present)
Target margin          → effectiveTargetPct() over the above
SKU override           → SkuCategoryOverride row, if any
Market snapshot        → PricingRound.marketSnapshotId (nullable — "NOT
                          CONNECTED" is a valid, honest answer)
Pricing goal            → chosen via suggestPricingGoals() at approval time
Suggested price         → CentralPriceLine.suggestedPrice
Approved price           → CentralPriceLine.approvedPrice
Approved by               → CentralPriceLine.approvedById → User
Approved at                → CentralPriceLine.approvedAt
```

This is implemented as a real feature, not just developer metadata: the
Central Pricing row (`src/app/pricing/central/page.tsx`) and its query
(`src/lib/queries/pricing.ts::getCentralPriceLines`) already assemble
cost → target → guard → suggested → resulting-margin for every row the user
sees. A dedicated lineage drawer surfacing the remaining fields (approved
by/at, source document link, market snapshot) is a small follow-up on the
same query — the data to back it already exists and is already joined once
per request; it does not require new schema.

Customer Pricing lineage works the same way, one hop further:
`CustomerPriceLine.centralPriceLineId` → the Central line above, so a
Customer Price's cost is always provably the same `CostSnapshotLine` the
Central Price used for that round (see
`tests/integration/dataIntegrity.test.ts` → "Central Pricing and Customer
Pricing read the exact same Current Cost").
