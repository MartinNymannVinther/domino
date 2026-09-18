# ADR 0003: Trigger-based, append-only audit log

Status: accepted · Date: 2026-09-18 (inherited from Haij by way of Ajour and Tavle, ADR 0003 in each)

## Decision

`audit_log` records who, what, when, workspace and before/after for every
mutation. Capture is a database trigger (`audit_row_change()`, AFTER
INSERT/UPDATE/DELETE) on every business-meaningful table, so application
code cannot forget it. Actor and workspace come from the transaction
context; auth-driven writes without a context fall back to the row's own
tenant column (`org_id` on domain tables, `organization_id` on the auth
tables) with `actor_type = 'system'`. A blanket redaction list strips
secrets (`password`, `token`, `secret`, `backup_codes`, OAuth tokens,
verification values, token and key hashes) from the stored row images.

Append-only is enforced in the database itself: the runtime roles have no
UPDATE/DELETE grant, and a trigger raises on UPDATE, DELETE and TRUNCATE —
superusers included.

Semantic events that are not row mutations (login, logout, an application
for access, an approval, an invitation minted or used) are written
explicitly via `recordAuthEvent()`.

The audit log is the operator's record of what happened. It is not the
flow's own history: the versions a flow keeps and the steps a run writes
are domain tables with their own purpose, readable by the people in the
workspace. The run tables are a record themselves and carry no audit
trigger: auditing a record is a copy, not a record (ADR 0011). The
versions are audited like any other row a person writes.

## Exclusions (deliberate)

`sessions`, `verifications` and `rate_limits` have no row triggers: they
are technical, high-churn tables whose business meaning (who logged in,
when) is captured as semantic events instead. The admission tables have no
row triggers either: they hold personal data about people who are not
users, and the semantic events say what was decided without copying the
application into the trail.

## Trade-offs accepted

- **No foreign keys on `audit_log`.** ON DELETE actions must never be able
  to touch the trail (and append-only would block them anyway). The cost is
  that `org_id`/`actor_user_id` are unconstrained text.
- **Actor granularity.** Better Auth's own writes run without an app
  context, so e.g. `users.insert` at signup is recorded as `system`; the
  adjacent `auth.login` event carries the user.
- **SECURITY DEFINER + superuser-owned.** The trigger function must insert
  into `audit_log` regardless of which confined role fired it; migrations
  therefore run as superuser (see ADR 0002).
- **GDPR tension.** Audit rows are immutable but may reference personal
  data. Workspace export and deletion (wave 2, a dogma) must define the
  audit-log policy explicitly — likely crypto-shredding or time-boxed
  retention. Explicitly deferred, not forgotten.
- **Volume.** before/after jsonb duplicates data. Fine at this scale;
  partitioning by month is the known escape hatch.
