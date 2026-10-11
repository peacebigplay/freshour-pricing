# Role Permissions

Enforced in two places that must agree: `src/middleware.ts` (route prefix →
allowed roles, fast-fail at the edge) and `src/lib/domain/rbac.ts` +
`requireRole()` calls in every Server Action (authoritative, re-checked on
every mutation regardless of what the UI shows).

| Role | Can | Cannot |
|---|---|---|
| **EXECUTIVE** | View `/exec`, `/customers`, `/summary`, `/process`, `/memory`, `/principles`; assign/decide/note/follow-up/resolve an `ExecutiveDecision` | Edit factory cost, publish selling prices, alter invoice values, allocate payments, edit connector secrets |
| **PRICING** | `/pricing`, `/pricing/central`, `/pricing/requests`, `/customers`, `/cost-market`, `/product-master`, `/margin-guard`, `/negotiations/:id`; approve Central/Customer prices; resolve product mappings; approve/reject negotiations; approve/reject a `PriceRequest`; generate missing Customer Price Sheets for a round; create a `Customer`; request a contract price raise | Send quotes to customers, close deals, manage users |
| **SALES** | `/sales`, `/sales/quotes/:id`, `/sales/issues`, `/customers`, `/negotiations/:id`; send a quote from an approved Customer Price Sheet; close a deal + send Financial Handoff; log/close a `CustomerIssue`; create a `Customer`; request a contract price raise (`PriceRequest`) | Change authoritative Current Cost, approve a new selling price, decide a `PriceRequest`, see or expose internal pricing logic to customers |
| **ADMIN** | `/admin/*`, `/product-master`; manage users, integrations, CSV financial fallback import, post invoices | Approve prices (not a Pricing-role action) |

All four roles can reach `/summary`, `/process`, `/memory`, `/principles`
(shared operational tools).

`/q/:token` (the public quote) requires no role — it's intentionally outside
authentication, and reads through a DTO that structurally cannot expose any
internal field (see `docs/ARCHITECTURE.md` → Public surface).

There is **no Accounting login role** in this phase — accounting/financial
actual data is an internal domain (`Invoice`, `Payment`, …) operated through
Admin's financial fallback import, per the Master Prompt.
