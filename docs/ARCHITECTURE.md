# Architecture

## Overview

Freshour is a server-rendered Next.js (App Router) application. Business
rules live in `src/lib/domain/` as pure, unit-tested TypeScript functions —
not in React components, and not duplicated between client and server.
Every page that reads business data is a React Server Component that queries
PostgreSQL directly through Prisma (`src/lib/queries/`); every mutation is a
Next.js Server Action that re-checks authentication and role on the server
before touching the database (`src/lib/auth/currentUser.ts` →
`requireRole`).

```
Browser
  │  (httpOnly signed session cookie)
  ▼
Next.js edge middleware (src/middleware.ts)
  │  — fast reject: no cookie / wrong role for this route prefix
  ▼
Server Component page (src/app/.../page.tsx)
  │  — requireRoleOrRedirect() in the route's layout.tsx (defense in depth:
  │    re-checks the DB session row, not just the JWT, so a revoked session
  │    stops working immediately even if the JWT hasn't expired)
  │  — src/lib/queries/*.ts for reads
  ▼
PostgreSQL (via Prisma)
```

Mutations go through the same `requireRole` check inside the Server Action
itself (`src/app/.../actions.ts`) — never only in the UI. A disabled button
is a UX nicety, not a security boundary.

## Why not put business logic in components

Every formula the business cares about (margin %, the margin guard price,
the effective target, supplier max cost in a negotiation, what a public quote
response is allowed to contain) lives in `src/lib/domain/*.ts` as a pure
function with no dependency on React, Next.js, or Prisma. That's what lets
`tests/unit/*.test.ts` run in under a second with no database, and it's what
stops "the margin formula" from silently drifting between the Central
Pricing page and the Customer Pricing page.

## Authentication

- Password hashing: Argon2id (`argon2` package) — a memory-hard KDF, not a
  fast hash.
- Session: a `Session` row in Postgres (`src/lib/auth/session.ts`) plus a
  JWT (HS256, `jose`) stored in an httpOnly, `SameSite=Lax`, `Secure` (in
  production) cookie. The JWT carries only `{ sub: userId, role, sid:
  sessionId }` — looking the session row up on every request (via React's
  `cache()` so it's once per request, not once per component) means logout
  and admin deactivation take effect immediately, not just at JWT expiry.
- The cookie itself never contains the session's identifying secret in
  reusable form beyond what's needed to verify the JWT signature; the public
  quote token (customer-facing, Section 18) is a *separate*, higher-entropy
  opaque token whose SHA-256 hash — not the token itself — is what's stored
  in `PublicQuoteToken.tokenHash`.

## RBAC

`src/lib/domain/rbac.ts` is the single source of truth for "can role X do
action Y" — both the edge middleware (route-level, fast fail) and every
Server Action (`requireRole([...])`, action-level, authoritative) consult it
or an equivalent role list. See `docs/ROLE_PERMISSIONS.md`.

## Versioning and immutability

Historical financial/pricing facts are never mutated in place:
- `CostSnapshot` / `SourcePriceSnapshot` / `MarginPolicyVersion` /
  `MarketSnapshot` are append-only; a `PricingRound` pins the exact snapshot
  + policy version it was built from (foreign keys, not copies), so "why was
  this price X in this round" is answerable later by following those keys.
- `QuoteRevision` is a new row per revision (e.g. after a negotiation is
  approved) rather than an update to the existing quote lines, so the full
  price history of a quote is preserved.
- Approving a `CentralPriceLine` or `CustomerPriceLine` uses an optimistic
  lock (`version` column, checked-and-incremented in one transaction) so two
  Pricing users approving the same line concurrently can't silently
  overwrite each other — the loser gets a "this was changed by someone else,
  refresh" error instead.

## Concurrency / idempotency

- Price approval: optimistic locking (see above).
- Invoice import: duplicate `invoiceNumber` is detected and routed to a
  `ReconciliationException` rather than silently re-imported.
- Quote send / public response: each mutation runs inside a Prisma
  `$transaction`, and `PublicQuoteToken` + `QuoteResponse` carry unique
  constraints (`tokenHash` unique, `quoteLineId` unique on `QuoteResponse`)
  to prevent a double-submit from creating two negotiation cases for the
  same line.

## Public surface

`/q/:token` is the only route reachable without authentication (besides
`/login`). It is excluded from the authenticated-route middleware entirely
and reads through a dedicated DTO (`src/lib/domain/publicQuoteDto.ts`) that
allow-lists exactly `{ productName, unit, price }` — cost, margin, target
margin, floor, competitor price, supplier cost target, internal notes, and
match confidence are structurally impossible to leak through it, because the
DTO type doesn't have fields for them. `tests/unit/publicQuoteDto.test.ts`
asserts this.

## Background work

This build does not include a queue/worker process (e.g. BullMQ) — imports
(PDF/CSV) and invoice posting run synchronously inside a Server Action,
which is adequate at Freshour's weekly-cycle, few-hundred-SKU scale. If
import volume grows or a real-time market connector is added, that's the
natural place to introduce a job queue (`JobRun` already exists in the data
model for this).
