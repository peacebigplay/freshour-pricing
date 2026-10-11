# Source Data Mapping

How `ใบราคาขาย+ทุน หมูอนามัย AL 01-07.10.69.pdf` maps onto the data model.
See `docs/SOURCE_DATA_EXTRACTION_REPORT.md` for the extraction methodology
and full review queue; this doc is about the mapping, not the extraction.

## Main table (bulk, 192 product rows, source rows 1–196 with 4 genuine gaps)

| Source column | JSON field | DB field |
|---|---|---|
| ลำดับ | `source_row_no` | `CostRawRow.sourceRowNo` (preserved verbatim, never renumbered) |
| รายการสินค้า แยกชนิด | `source_name` | `CostRawRow.sourceName` (verbatim Thai) / `ProductAlias.alias` |
| — (cleaned) | `canonical_name` | `CostRawRow.canonicalName` / `Product.canonicalName` |
| สเปก | `specification` | `CostRawRow.specification` |
| ปริมาณ | `pack_quantity` | `CostRawRow.packQuantity` |
| หน่วย | `unit` | `CostRawRow.unit` / `Product.defaultUnit` |
| 24-30/09/2026 | `previous_cost` | `CostRawRow.previousCost` → `CostSnapshotLine.previousCost` |
| 01-07/10/2026 | `current_cost` | `CostRawRow.currentCost` → `CostSnapshotLine.currentCost` |
| Column1 (Δ) | `cost_delta` | `CostRawRow.costDelta` → `CostSnapshotLine.costDelta` |
| ราคาขายปลีก → หน้าร้านอารีย์ | `source_price_reference.retail_ari` | `SourcePriceSnapshotLine.retailAri` |
| ราคาขายส่ง → 2kg ต่อรายการ | `source_price_reference.wholesale_2kg` | `SourcePriceSnapshotLine.wholesale2kg` |
| ราคาขายส่ง → 5kg ต่อรายการ | `source_price_reference.wholesale_5kg_or_4kg` | `SourcePriceSnapshotLine.wholesale5kgOr4kg` |
| ราคาขายส่ง → 10kg ต่อรายการ | `source_price_reference.wholesale_10kg` | `SourcePriceSnapshotLine.wholesale10kg` |

The extraction report confirms the real wholesale tiers are **2 / 5 / 10 kg**
(header: "ราคาขายส่ง (ตามเฮียหมิง)"), matching the Master Prompt's original
assumption. The field name `wholesale5kgOr4kg` is kept exactly as specified
by the build brief for traceability; it holds a true 5kg-tier value for this
document.

None of these four price-reference tiers is treated as "the one true
selling price" anywhere in the system — Central Pricing computes its own
suggested price from cost + margin policy, and shows these only as
historical/reference context (Master Prompt Section 3).

## Frozen section (3 rows, own 1–3 numbering, `source_table: "frozen_section"`)

| Source column | JSON field | DB field |
|---|---|---|
| รายการสินค้า หมูอนามัย (แช่แข็ง) | `source_name` | same as above, `catalogSegment: "frozen"` |
| สเปค | `specification` | same |
| การบรรจุ | `unit` (e.g. "แพคกล่อง") | same |
| 24-30/09/2026 / 01-07/10/2026 / Column1 | same as bulk | same |
| ราคาขาย(ตามอาจือ) → ราคาขายลูกค้า | `source_price_reference.customer_price` | `SourcePriceSnapshotLine.customerPrice` |

All 3 frozen rows have `customer_price: null` **by design** — the source
sheet's own footnote says the salesperson quotes whatever price was given
verbally to the customer and there is no standing wholesale price for this
section. This is captured faithfully (`extraction_status: "OK"`, with a
`review_notes` explanation), not treated as a missing-data defect.

## Category classification caveat

`Product.category` (COMPETITIVE / POPULAR / OFFAL / OTHER, used to resolve
the margin target) is **not** in the source PDF — it's a placeholder
heuristic (`guessCategory()` in `prisma/importSourceData.ts`, a simple
keyword match on offal/popular-cut terms) applied at import time so every
product has *some* category and the pricing engine can run immediately.
PRICING/ADMIN should review and correct these via Product Master before
relying on category-driven margin targets for a real pricing round; this is
flagged explicitly rather than presented as verified business classification.

## Manual review queue (1 row)

Source row 108 (`ขาหมูเผาตัดแว่น กก.ละ (ยกขา)`, page 2): the customer-name
text in the สเปก column could not be read with full confidence even at 4x
zoom. It is staged with `extraction_status: "NEEDS_SOURCE_REVIEW"` and
**deliberately excluded** from the published Cost Snapshot / Central
Pricing — it sits in `ProductMappingQueue` until a human confirms the text
against the source Excel file. This is the "unresolved product mapping
blocks publish" rule in action (Master Prompt Section 11), demonstrated on
real data rather than only in a unit test.
