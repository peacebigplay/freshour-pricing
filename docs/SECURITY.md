# Security

## Authentication
- Argon2id password hashing (`argon2` npm package — memory-hard, resistant
  to GPU cracking).
- Sessions: signed JWT (HS256) in an httpOnly, `SameSite=Lax` cookie,
  `Secure` in production, cross-checked against a server-side `Session` row
  on every request (`getCurrentUser()` in `src/lib/auth/currentUser.ts`) so
  logout/deactivation is immediate rather than waiting for JWT expiry.
- `AUTH_SECRET` must be a long random value (`.env.example` documents
  generating one with `openssl rand -base64 48`); the app refuses to sign a
  session without it (`src/lib/auth/session.ts::getSecret`).
- Login error messages are generic ("email or password incorrect") for both
  "no such user" and "wrong password" to avoid account enumeration
  (`src/app/login/actions.ts`).

## Authorization
- Edge middleware (`src/middleware.ts`) is the first line of defense per
  route prefix, but every Server Action independently calls `requireRole()`
  (`src/lib/auth/currentUser.ts`) before touching the database — a disabled
  button or hidden nav link is never the only thing stopping an action.
- `src/lib/domain/rbac.ts` is unit-tested (`tests/unit/rbac.test.ts`) for
  the specific "SALES cannot approve prices", "EXECUTIVE cannot edit cost",
  "only ADMIN manages users" invariants from the spec.

## Input validation
All Server Actions validate their `FormData` with Zod schemas before doing
anything (see e.g. `src/app/pricing/central/actions.ts`,
`src/app/admin/invoices/actions.ts`). Prisma's query builder is used
exclusively — no raw string-concatenated SQL anywhere in the app code (the
one `$queryRaw` use in the integration-test harness is a literal `SELECT 1`
liveness check with no interpolated input).

## Public quote endpoint (`/q/:token`)
- The token itself is a 32-byte random value (`generateOpaqueToken()`,
  `node:crypto` `randomBytes`), shown to the Sales user exactly once at
  creation. Only its SHA-256 hash is persisted (`PublicQuoteToken.tokenHash`,
  unique) — a database compromise doesn't hand over valid customer links.
- Tokens expire (14 days by default) and can be revoked; expired/revoked
  tokens 404 rather than erroring in a way that confirms they once existed.
- Every public response is rate-limited per token (30/hour,
  `src/app/q/[token]/actions.ts`) — generous enough for a real customer
  working through a price sheet, tight enough to blunt scripted abuse.
- The response payload is assembled exclusively through
  `toPublicQuoteLine()` (`src/lib/domain/publicQuoteDto.ts`), whose return
  type structurally has only `{ productName, unit, price }` — cost, margin,
  target margin, floor, competitor price, supplier cost target, internal
  notes, and match confidence cannot be serialized through it by
  construction, not just by convention. Unit-tested
  (`tests/unit/publicQuoteDto.test.ts`) including a negative test that an
  accidentally-leaked field is detected.

## File upload / import
- The CSV financial-fallback import (`src/app/admin/invoices/actions.ts`)
  parses a bounded, required-column CSV format server-side (ADMIN-only) —
  no arbitrary file execution, no eval, no formula injection surface (values
  are read as plain text/number, never rendered as spreadsheet formulas and
  never shell-executed).
- The PDF/CSV cost import pipeline (`prisma/importSourceData.ts`) is run by
  a human operator via a trusted script, not an unauthenticated upload
  endpoint, in this build.

## Secrets
`AUTH_SECRET` and `DATABASE_URL` are read from environment variables only
(`.env.example` documents the shape; `.env`/`.env.local` are gitignored).
No secret is ever logged — Prisma's client logging is restricted to
`warn`/`error` in development and `error` only in production
(`src/lib/db.ts`), and none of those log lines include credentials.

## Audit trail
Every mutating Server Action writes an `AuditEvent` row (actor, entity,
action, before/after where meaningful) — visible to all roles on the
**Memory** page. This is append-only; nothing deletes or edits an
`AuditEvent`.

## Known gaps / follow-ups
- No CSRF token beyond Next.js Server Actions' built-in origin check and
  `SameSite=Lax` cookies — acceptable for this deployment shape (no
  cross-origin form posts to these actions are expected) but worth a
  dedicated review before exposing the admin surface more broadly.
- No centralized rate limiting on the authenticated API surface beyond the
  public quote endpoint — add one (e.g. at a reverse proxy) before exposing
  login or admin routes directly to the internet without a VPN/allowlist.
- No automated dependency vulnerability scanning wired into CI yet (see
  `docs/OPERATIONS.md`).
