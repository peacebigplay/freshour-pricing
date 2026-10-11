# Source Data Extraction Report

## Source document

- **File:** `ใบราคาขาย+ทุน หมูอนามัย AL 01-07.10.69.pdf`
- **Pages:** 3 (A4, Excel export)
- **Title:** ใบราคาขาย+ทุน หมูอนามัย AL 01-07.10.69 (pork cost + selling price sheet, effective 01–07/10/2569 BE = 01–07/10/2026 CE)
- **Extraction method:** Direct visual read of the PDF. The source was rendered to PNG at 400 DPI with `pdftoppm`, then cropped into overlapping horizontal strips (and further zoomed 1.6x–4x on individual cells where needed) so that every cell of 8–10pt source text could be read at high effective resolution. Every row was read at least once at a legible zoom level; ambiguous Thai proper nouns / customer names were re-cropped and re-read a second time at higher magnification to cross-check the first pass. No OCR software was used — all transcription is a direct human-style visual read by the model.
- **Output file:** `data/imports/freshour_pork_price_cost_2026-10.source.json` (195 JSON objects)

## Row counts

| Category | Count |
|---|---|
| Main table — product rows | 192 |
| Main table — section_header rows | 0 (see note below) |
| Frozen-section rows | 3 |
| **Total JSON records** | **195** |

**Note on section headers:** the task brief anticipated merged/colored "category band" rows (e.g. a bare "หมูเนื้อแดง" header with no numeric data) interleaved in the main table. After reading all three pages in full, **no such rows exist in this particular document** — every numbered row (ลำดับ 1–196, minus the 4 missing numbers below) carries a full set of product data (name, unit, cost, prices). Some rows are clearly category-adjacent (e.g. row 21 "เนื้อแดง กก.ละ" is itself a priced product, not a bare header). No row was classified as `section_header`; all 192 present rows are `row_type: "product"`.

## Source row numbers found / gaps

The ลำดับ column runs from 1 to 196, but is **not contiguous**. Four numbers are genuinely absent from the printed sheet (verified by close zoom on each boundary — these are not hidden/merged rows, the numbering itself skips):

- **32** — between row 31 (สันคอหมู กก.ละ) and row 33 (สันคอบด), page 1
- **39, 40** — between row 38 (สันคอหมูพันกลมสไลซ์ กก.ละ) and row 41 (สันนอกหมู กก.ละ), page 1
- **159** — between row 158 (ตือฮวนรวม กก.ละ) and row 160 (หัวไส้), page 2

192 product row numbers were extracted (196 − 4 gaps). The frozen section uses its own separate 1–3 numbering (see below) and is **not** part of this sequence.

## Duplicated row numbers

None found. Every ลำดับ value in the main table is unique.

## Rows with ambiguous / uncertain text

During the first pass at lower zoom several Thai proper nouns (customer/shop names in the สเปก column) were initially misread and were corrected after a second, higher-magnification pass. Final transcriptions used in the JSON (corrected):

- Row 51, 70, 87: customer name is "คุณเอศุภชัย" (not an earlier misread "เอฐุชัย")
- Row 66: customer name is "ลูกค้าไหวเล่า" (not "ไทีเล่า")
- Row 67: customer name is "ลูกค้ามากูโร่" (confirmed)
- Row 71, 72: shop name is "ร้านรื่นฤดี" (not "ร้านวันดุดี")
- Row 107: spec reads "สไลซ์ต้มยำลูกค้าอลิซาเบธ" (not an earlier misread "ตํ่ามำ")
- Row 120, 121: product name uses "มันแค็ป…" (not "มันแข็ง…" / "มันแคีป…")
- Row 171: customer note is "(ลูกค้า กระเพราขุนช้าง)" (not "ชูช้าง")

These are reflected correctly in the JSON and are marked `extraction_status: "OK"` since confidence after the second pass is high.

One row remains genuinely uncertain after multiple zoom passes:

- **Row 108** (`ขาหมูเผาตัดแว่น กก.ละ (ยกขา)`, page 2) — the customer-name text in the สเปก column is small, bold, and visually overlapping even at 4x zoom. Best-effort reading is "ลูกค้าอัพกฤตองกิลล์" but this is **not confidently correct** (a few characters in the middle of the name could not be resolved with certainty). `specification` is populated with this best-guess text, but `extraction_status` is set to `NEEDS_SOURCE_REVIEW` and `raw_text_observed.specification` records the uncertain reading for a human to verify against the original Excel file if available.

## Rows where units or prices could not be confidently extracted

None. Every numeric cell (previous_cost, current_cost, cost_delta, and the four price-reference columns) that is present in the source was legible at high zoom and cross-checked. Several rows contain internally unusual-looking combinations (e.g. retail price lower than one or more wholesale tiers — rows 92, 124, 143 — or two adjacent rows sharing identical cost but different retail price — rows 100/101) but all were re-verified at high zoom against the source pixels and are transcribed exactly as printed; these are standing data characteristics of the source sheet, not extraction errors.

Rows with a blank ปริมาณ (pack quantity) cell in the source (printed with no number, only a unit) were recorded as `pack_quantity: null` rather than guessed. This affects source_row_no 160–196 inclusive (all present numbers in that range) and no others — for all of rows 1–158 (less the 3 gaps) the ปริมาณ cell was legibly "1" except row 5 (10), row 79 (2), row 146 (1, unit ถุง) and row 155 (1, unit ขวด).

## Frozen-section records summary

A separate small table appears near the bottom of page 3, under its own yellow-highlighted header band reading **"ราคามีผลวันที่ 01-07/10/69 ณ.30/09/69"**, with columns: ลำดับ | รายการสินค้า หมูอนามัย (แช่แข็ง) | สเปค | การบรรจุ | 24-30/09/2026 | 01-07/10/2026 | Column1 | ราคาขาย(ตามอาจือ) → ราคาขายลูกค้า.

It contains exactly 3 rows (own numbering 1–3, restarted — not a continuation of the main table's 1–196 sequence):

| # | Name | Spec | Pack | Prev cost | Curr cost | Δ | Customer price |
|---|---|---|---|---|---|---|---|
| 1 | สันนอกหมูแช่แข็ง | สเปคกลางโรงงาน (ยกก้อน) | แพคกล่อง | 122 | 116 | −6 | *(blank)* |
| 2 | สันคอหมูแช่แข็ง | สเปคกลางโรงงาน (บั้ง) | แพคกล่อง | 160 | 156 | −4 | *(blank)* |
| 3 | สามชั้นแผ่นติดหนังแช่แข็ง | สเปคกลางโรงงาน(ยกแผ่น) | แพคกล่อง | 164 | 160 | −4 | *(blank)* |

The "ราคาขายลูกค้า" (customer selling price) column is **blank for all 3 rows in the source**. Directly below the table a note in colored text states (verbatim): *"**ราคาขาย อาจือให้ใช้ราคาที่แจ้งนำเสนอขายลูกค้าได้เลยค่ะ** ไม่มีราคาส่ง"* — i.e. the salesperson ("อาจือ"/Ajue) should quote whatever price was communicated verbally to the customer, and there is no standing wholesale price for this section. Accordingly all 3 frozen rows carry `source_price_reference.customer_price: null` with a `review_notes` explanation; this is a faithful transcription of the source (intentionally blank), not a missing-data extraction failure, so `extraction_status` is `"OK"`.

These rows use `catalog_segment: "frozen"`, `source_table: "frozen_section"`, and `source_page: 3` in the JSON.

## Manual-review queue

| source_row_no | source_table | Product name | Field | What was observed |
|---|---|---|---|---|
| 108 | main | ขาหมูเผาตัดแว่น กก.ละ (ยกขา) | specification | Customer name text illegible with full confidence even at 4x zoom; best-guess transcription used ("ลูกค้าอัพกฤตองกิลล์") but several characters are uncertain. Needs confirmation against the source Excel file. |

No other rows required a NEEDS_SOURCE_REVIEW flag. All other extracted values (names, specs, quantities, units, costs, deltas, and the four price-reference columns) were read with full confidence, most after at least one high-zoom cross-check pass.

## Price-reference column headers (exact source text)

The spec given to this task assumed 2kg/5kg/10kg wholesale tiers but asked for verification. The **exact header text found on page 1** is:

- Top band (blue): **"มีผล 01-07/10/69 * JUM PLEASE CHECK MARKET"**
- Column group 1: **"ราคาขายปลีก"** (retail price) → sub-header **"หน้าร้านอารีย์"** (front of the Ari storefront) — mapped to `retail_ari`
- Column group 2: **"ราคาขายส่ง (ตามเฮียหมิง)"** (wholesale price, per Hia Ming [a named person/buyer]) with three sub-headers:
  - **"2kg ต่อรายการ"** → mapped to `wholesale_2kg`
  - **"5kg ต่อรายการ"** → mapped to `wholesale_5kg_or_4kg` (confirmed **5kg**, not 4kg — the field name in the output schema is kept as specified by the task but the real tier is 5kg)
  - **"10kg ต่อรายการ"** → mapped to `wholesale_10kg`

So the wholesale tiers are confirmed as **2 / 5 / 10 kg**, matching the original master-spec assumption (not 2/4/10). Downstream code can treat `wholesale_5kg_or_4kg` as a true 5kg tier for this document with no further adjustment needed, though the field name itself may be worth renaming to `wholesale_5kg` in a future schema revision for clarity.

The cost-column headers are: **"EK ปรับราคาทุน(เก่า)"** (old adjusted cost) with sub-date **"24-30/09/2026"**, and **"EK ปรับราคาทุน(ใหม่)"** (new adjusted cost, highlighted pink) with sub-date **"01-07/10/2026"**, plus **"Column1"** for the delta (shown with a colored up/down triangle icon; all deltas observed in this document point down or flat, i.e. `current_cost - previous_cost ≤ 0` throughout — no cost increases appear anywhere in the sheet).

## Files written

- `data/imports/freshour_pork_price_cost_2026-10.source.json` — 195 records (192 main product rows + 3 frozen-section rows)
- `docs/SOURCE_DATA_EXTRACTION_REPORT.md` — this report
