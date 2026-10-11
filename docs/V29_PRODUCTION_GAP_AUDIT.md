# V29 → Production Gap Audit

V29 (`Freshour_Pricing_v29_ExecutiveRestored_NoAccountingLogin.html`) is a
single-file client-side prototype: a role-switcher shell (`LIB-JS`) wrapping
per-page scripts (`data-page="exec"`, `"pricing"`, `"sales"`, `"customers"`,
`"costs"`, `"brain"` (Summary), `"process"`, `"memory"`, `"logic"`
(Principles), `"guard"` (Margin Guard), `"wiring"` (Connections),
`"productmaster"`, `"quotes"`, `"finance"`, `"admin"`), all driven by a
hard-coded fixture object (`FX-JSON`) — there is no server, no database, no
real authentication, and every "save" is cosmetic (per V29's own `help`
panel: "ปุ่มที่กดแล้วบันทึกจะขึ้นว่าสำเร็จ แต่ตัวเลขไม่ขยับ ถือว่าปกติ").

This audit tracks what this production build preserved, what it
deliberately changed, and what's still open.

## Preserved (per `Freshour_V29_QA.json`)

| QA check | Status here |
|---|---|
| Executive is a login role | ✅ `User.role = EXECUTIVE`, real auth |
| Accounting is not a login role | ✅ no `ACCOUNTING` in the `Role` enum; `Invoice`/`Payment` are an internal domain operated via Admin |
| Pricing lands on `/pricing` | ✅ `src/app/pricing/page.tsx` |
| Executive/Pricing/Customers/Sales/Cost & Market nav | ✅ `src/components/ui/AppShell.tsx` |
| Summary/Process/Memory/Principles/Margin Guard/Product Master tools | ✅ all present, all DB-backed (no hard-coded copy) |
| Per-SKU category target preserved | ✅ `SkuCategoryOverride` + `effectiveTargetPct()` |
| SKU-specific margin override preserved | ✅ same |
| Global floor preserved | ✅ `MarginPolicyVersion.globalFloorPct`, default 12% |
| Financial data as internal layer, not Accounting login | ✅ see above |

## Deliberately changed from V29

- **Persistence:** V29's fixture object → real PostgreSQL with 60+ tables
  and append-only snapshots/versions. Nothing is "fake-saved."
- **Auth:** V29's role-picker login → real Argon2id + signed sessions.
- **Business logic location:** V29 computed margin/guard math inline inside
  each page's embedded `<script>` → centralized, pure, unit-tested in
  `src/lib/domain/`.
- **Visual language:** V29's dark operator-console theme (`--bg:#0E1512`,
  green accent) was intentionally replaced with the bright, cobalt-blue
  SaaS-dashboard direction specified in the Master Prompt's visual
  reference (Section 5/6) — V29 was explicitly scoped as the *information
  architecture and workflow* reference, not the final visual design.
- **Public quote:** V29 had no real customer-facing surface; this build
  adds a genuinely public, token-secured `/q/:token` with a DTO that
  structurally cannot leak internal fields.

## Open gaps (honestly, not glossed over)

- **Market connector:** no live competitor-price connector exists (by
  design — Master Prompt Section 34 explicitly forbids fabricating one).
  `/cost-market` correctly shows `NOT CONNECTED`. A real connector or a
  verified manual-entry UI for store-checks is the natural next increment.
- **e-Today / payment gateway:** not connected; CSV fallback import exists
  and is fully functional for invoices, but `Payment`/`PaymentAllocation`
  (AR) has schema but no dedicated UI yet.
- **Lineage drawer:** the lineage *data* is fully joinable today (see
  `docs/DATA_LINEAGE.md`) and already partly surfaced inline on Central
  Pricing; a dedicated modal/drawer presenting all fields in one place
  (Section 27's exact mock layout) is UI polish, not a data gap.
- **Visual regression screenshots** (Section 39): not automated in this
  pass — see `docs/TEST_PLAN.md`.
- **Category classification accuracy:** the initial `Product.category` for
  each of the 194 imported products is a keyword-heuristic guess (see
  `docs/SOURCE_DATA_MAPPING.md`), not a verified business classification —
  flagged for PRICING/ADMIN review via Product Master before being relied
  on for a live pricing round.
- **E2E/integration automated execution:** written and (for integration)
  manually verified true against real data, but not confirmed green via an
  automated CI run in this environment — see `docs/TEST_RESULTS.md` for
  exactly why and what was actually executed instead.

No functional area from the Master Prompt's Section 44 "Definition of Done"
checklist was skipped outright; the items above are refinements/connectors
on top of a working end-to-end system, not missing pillars.
