# Integrations

Status is tracked in the `IntegrationConfig` and `MarketSource` tables and
rendered truthfully on `/admin/integrations` and `/cost-market` — a
connector is never shown as `CONNECTED` unless it has actually succeeded.

| Integration | Status at seed time | Fallback |
|---|---|---|
| Market / competitor price connector | `NOT_CONFIGURED` | Manual CSV / store-check (`MarketSource.kind = "store_check"`), also `NOT_CONFIGURED` until someone records a real observation |
| e-Today accounting | `NOT_CONFIGURED` | CSV upload on `/admin/invoices` (`InvoiceImportBatch.source = "csv_fallback"`) — fully implemented and is how this build's financial boundary was exercised |
| Payment gateway | `NOT_CONFIGURED` | Manual `Payment`/`PaymentAllocation` rows (schema exists; no UI yet — see gap audit) |
| Factory cost/price source | PDF import, repeatable pipeline | `prisma/importSourceData.ts` accepts any file in the same JSON shape; a future CSV/XLSX/API source just needs its own extraction step feeding the same staging schema |

## Adding a real connector later

1. Implement the fetch/normalize step as its own module, writing into
   `MarketRawObservation` (market) or `InvoiceRawRow` (financial) —
   reusing the existing raw-staging tables rather than inventing new ones.
2. Flip the relevant `IntegrationConfig.status` only after a real successful
   run (`IntegrationRun` row with `outcome: "success"`), never manually.
3. Everything downstream (Pricing Goals' "Competitive" suggestion, Executive
   revenue) already reads through the published-snapshot tables, so once a
   connector publishes a real `MarketSnapshot` / `POSTED` `Invoice`, no
   other code change is needed for it to start showing up.
