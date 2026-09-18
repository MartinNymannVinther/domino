# Maintenance scripts

One-off tools, run by hand against a Domino database. None of them is
reachable from the application, and that is the point: each one does
something the running app must refuse to do.

Run them with `pnpm script <file> [arguments]`.

## set-password.ts

Sets a password on an existing account.

```
pnpm script scripts/set-password.ts <email>          # asks, without echo
... | pnpm script scripts/set-password.ts <email>    # reads from stdin
```

For the one situation the application has no way out of: an owner who
signs in only with a passkey, and who needs to reach the same account
from a different origin. Passkeys are bound to the origin they were
created for, by design, so moving an installation from localhost to a real
domain locks a passkey-only owner out of their own system — and there is
no "forgot password" to fall back on, because Domino sends no mail.

It is a script and not a feature because setting someone else's password
outside the login flow is exactly the capability an attacker wants. It
belongs on the machine that already has database credentials.

## grant-owner.ts

Names the installation's owner: the one account that may admit new
workspaces (Indstillinger → Adgang).

```
pnpm script scripts/grant-owner.ts                 # shows who holds the role
pnpm script scripts/grant-owner.ts <email>         # gives the role to that user
pnpm script scripts/grant-owner.ts <email> --only  # ... and takes it from everyone else
```

The first account on an empty installation gets the role by itself. That
is right for a fresh install and wrong for a development database full of
test users, which is what this script is for. ADR 0004 explains why it is
a script and not a setting.

## ensure-roles.ts

Gives the two runtime database roles their login rights and passwords.
Runs as part of `pnpm db:migrate` and on every deploy; see docs/deploy.md
for why it exists.

## cleanup-demos.ts

Deletes demo workspaces that have expired. The application runs the same
cleanup on every visit to `/demo`; the script is for a quiet installation
or a scheduler that would rather not rely on visitors. Safe to run twice.

## migrate.ts

Applies the checked-in migrations and, unlike `drizzle-kit migrate`, says
what went wrong when it cannot. `pnpm db:migrate` is this script followed
by `ensure-roles.ts`; the container runs it before the application
starts.

## backup-domino.sh

Nightly encrypted dump of the database to EU object storage. Runs on the
VPS from cron, not in a container; docs/deploy.md section 7 has the setup.
