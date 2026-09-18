# ADR 0002: Multi-tenancy enforced with RLS and two runtime roles

Status: accepted · Date: 2026-09-18 (inherited from Haij by way of Ajour and Tavle, ADR 0002 in each)

## Decision

Single database, `org_id` on every domain table, row-level security
**enabled and forced** on every table. Two runtime Postgres roles, neither
of which can bypass RLS:

- `domino_app` — all domain queries. Policies key on
  `current_setting('app.org_id')`/`('app.user_id')`, set per transaction by
  `withOrgContext()` from the session's active workspace. No setting →
  every predicate is NULL → zero rows: default deny.
- `domino_auth` — Better Auth's own connection pool, and the admission
  flow's. Login must look up users before any workspace context exists, so
  this role has unrestricted policies on the auth and admission tables
  only, insert-only access to `audit_log`, and no grants at all on domain
  tables. Conversely `domino_app` cannot read `accounts`, `sessions`,
  `passkeys`, `two_factors`, `verifications`, `rate_limits` or the
  admission tables — domain code can never touch password hashes, session
  tokens, TOTP secrets or invitation keys.

Migrations run as the Postgres superuser through a third connection string.
`tests/rls/` is the executable specification, including a meta-test that
fails any future table without forced RLS.

RLS separates workspaces; it does not separate flows within one. A
person who belongs to a workspace can reach every flow in it. Finer
rights inside a workspace — owners and admins shaping the team, everyone
building and running flows — are an application concern on top of this
model, never a replacement for it.

## Alternatives rejected

- **App-level filtering only** (WHERE org_id = ...): one forgotten WHERE is
  a data breach. Rejected.
- **Schema- or database-per-tenant**: strong isolation but heavy operations
  (migrations × tenants) for a tool meant to admit many small workspaces.
  Rejected; RLS gives isolation without the fleet.
- **A single role for app and auth**: would force workspace-scoped policies
  to coexist with auth's pre-context lookups on the same role, weakening
  both. Rejected.

## Trade-offs accepted

- Domain code must go through `withOrgContext()`. Mitigated by default
  deny: forgetting the helper returns zero rows in dev immediately, rather
  than leaking cross-tenant data.
- `domino_auth` is trusted with all auth tables; Better Auth's own logic is
  the guard there. Its blast radius is capped by having no domain grants.
- Migrations require superuser (the SECURITY DEFINER audit function owner
  must bypass RLS on `audit_log`); acceptable for compose-based deploys
  where the superuser lives next to the database anyway.
- Policies key on the session's _active_ workspace; a person with several
  workspaces sees exactly one at a time. That is a product decision as much
  as a security one.
- There is no way to read a flow without a session in 0.9. If a public
  read-only flow link is ever added, it runs through a dedicated,
  minimal query with the workspace context set by the token's own row,
  never through a bypass role.
