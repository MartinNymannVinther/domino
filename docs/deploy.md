# Deploying Domino

Target: a single EU VPS (Hetzner initially — the provider must stay
replaceable) running [Coolify](https://coolify.io), deploying
`docker-compose.yml` from this repository. Everything runs in Docker; moving
to another EU provider means restoring one Postgres dump on another box.

Domino is built to share a server with the other Haij tools: its own
compose stack, its own database, its own domain, nothing in common at
runtime but the machine.

## 1. Server

- Create a VPS in an EU region (e.g. Hetzner Falkenstein/Nuremberg or
  Helsinki). 2 vCPU / 4 GB RAM is plenty to start, also next to Haij.
- Point DNS for your app hostname (e.g. `domino.haij.dk`) at the server.
- Install Coolify (their one-line installer) and log in.

## 2. Create the application

1. In Coolify: **New resource → Docker Compose**, connect this Git
   repository, branch `main`. Coolify picks up `docker-compose.yml`.
2. Set the environment variables (Coolify → Environment Variables):

   | Variable               | Value                                                               |
   | ---------------------- | ------------------------------------------------------------------- |
   | `POSTGRES_PASSWORD`    | `openssl rand -hex 24`                                              |
   | `DOMINO_APP_PASSWORD`  | `openssl rand -hex 24`                                              |
   | `DOMINO_AUTH_PASSWORD` | `openssl rand -hex 24`                                              |
   | `BETTER_AUTH_SECRET`   | `openssl rand -base64 32`                                           |
   | `BETTER_AUTH_URL`      | `https://domino.haij.dk` (public URL; passkeys bind to this origin) |
   | `LLM_PROVIDER`         | `mistral` hosted, `ollama` self-hosted, or leave unset for `none`   |
   | `MISTRAL_API_KEY`      | only with `LLM_PROVIDER=mistral`                                    |
   | `AI_DAILY_CALL_CAP`    | model calls per day across the whole installation; `0` for no roof  |

   Hex, not base64, for the three database passwords, and that is not a
   style preference. `docker-compose.yml` builds the connection strings by
   pasting the password into `postgres://user:PASSWORD@db:5432/domino`, and
   `openssl rand -base64` emits `/`, `+` and `=`. A slash ends the
   authority part of a URL, so the app then fails to start with a
   complaint about `APP_DATABASE_URL` while the thing that is wrong is a
   password. 24 bytes of hex is 192 bits; nothing is lost but the trap.
   `BETTER_AUTH_SECRET` never goes into a URL, so base64 is right there.

   **Coolify pre-fills every one of these with the wrong value.** When it
   reads `docker-compose.yml` to create the resource, it takes the text
   after `:?` on each line (compose's "you forgot this" message) and
   stores it as the variable's value. You will find `POSTGRES_PASSWORD`
   set to `set POSTGRES_PASSWORD (openssl rand -hex 24)`, and the same for
   the other three. The stack starts happily on those, every service
   agreeing on a password anyone can read in this repository. Replace all
   four before the first deploy. If a deploy has already run on them,
   also remove the database volume, because Postgres only reads its
   password when it first initialises. The migration step and the
   application both refuse to run on placeholder text and name it, so a
   missed one fails loudly rather than quietly.

   These set the default every workspace inherits. A workspace can choose
   its own provider, model and key in Settings → AI; keys stored that way
   are encrypted with a key derived from `BETTER_AUTH_SECRET`, so rotating
   that secret means each such workspace must enter its key again (ADR
   0009).

   The deployed commit is not one of these. `DOMINO_COMMIT` is a build
   argument, not a runtime variable — step 3 below is where it goes, and
   a value set here would be ignored, because the commit is inlined into
   the bundle when the image is built.

   `SIGNUP` is deliberately absent: it defaults to `closed`, which is what
   an installation on the open internet should be. See section 5.

   Every one of these is named in the `app` service's `environment:` block
   in `docker-compose.yml`, and that is not decoration. A variable set in
   Coolify reaches the compose file for `${...}` substitution; it does not
   reach the container unless the compose file forwards it. A setting that
   is not on that list is a setting the panel appears to accept and the
   application never sees. Adding an environment variable to Domino means
   adding it in both places.

3. Build arguments (Coolify → Build): pass `DOMINO_COMMIT` and, if you like,
   `DOMINO_BUILT_AT`. `.dockerignore` excludes `.git`, so without them the
   About page and `/api/version` honestly report `unknown` rather than
   guessing. Coolify exposes the commit it is building; if it cannot be
   wired automatically, set it by hand at each release — it is one line and
   it is what makes "which version is running" answerable.
4. Attach the domain to the `app` service and let Coolify provision TLS.
   Health check path: `/api/health`.
5. Deploy. The compose order is enforced: `db` becomes healthy → `migrate`
   runs all Drizzle migrations (as the Postgres superuser, which the
   SECURITY DEFINER audit trigger relies on) and then gives the two runtime
   roles their login rights and passwords → `app` starts.

   Role provisioning belongs to the migration step, not to
   `docker/postgres-init`. That init directory is bind-mounted from the
   repository, and a build system that removes its working copy after
   building mounts an empty directory instead: the script never runs, the
   migrations create the roles as NOLOGIN, and the application is refused by
   its own database with nothing in any log to explain it. `/api/health`
   answers 503, the container is marked unhealthy, and the proxy never
   requests a certificate — which looks like a TLS problem and is not.
   `scripts/ensure-roles.ts` closes that hole and is idempotent, so it also
   repairs an installation that already went wrong.

## 3. Verify

```bash
curl https://domino.haij.dk/api/health    # {"status":"ok"}
curl https://domino.haij.dk/api/version   # the release you just deployed
```

Then log in and open **Indstillinger → Om**: version, commit and build time
should match what you deployed, and the schema card should say the database
has applied as many migrations as the code expects. If it says migrations
are pending, the `migrate` service did not run — fix that before using the
installation.

## 4. Bringing an existing database with you

Moving a working installation (or a local development database) onto the
server is a dump and a restore. On the machine that has the data:

```bash
pg_dump -Fc -U postgres domino > domino.dump
scp domino.dump root@your-server:/root/
```

On the server:

```bash
DB=<domino db container id>   # docker ps; a shared server has more than one "db"
docker cp /root/domino.dump "$DB":/tmp/domino.dump
# The roles are provisioned by the migration step; the dump carries the data.
docker exec "$DB" pg_restore -U postgres -d domino --clean --if-exists /tmp/domino.dump
docker exec "$DB" rm /tmp/domino.dump
```

**Passkeys do not travel.** A passkey is bound to the origin it was created
for, so one registered on `http://localhost:3000` will not work on
`https://domino.haij.dk`. Log in with your password and register a new
passkey there. That is WebAuthn working as designed, not a bug.

## 5. Who can create an account

`SIGNUP` defaults to `closed`: once the installation has its first user,
registration is refused, at the endpoint and not merely in the interface.
The first account on an empty installation is let through, which is how you
get in at all.

So on a fresh installation, register immediately after the first deploy —
that first registration is the one that closes the door behind it. On an
installation restored from a dump the door is already closed, because the
users came with the data.

Setting `SIGNUP=open` re-opens registration for anyone who finds the
address. That is for a demo instance, not for an organisation's own Domino.

### Letting people in one at a time

A closed installation still has a front door. `/register` shows a short
application (name, e-mail, organisation, a line about the team) instead
of a closed sign; nothing is created until you decide. The installation's
owner sees applications under Indstillinger → Adgang with a count in the
navigation, approves or declines, and gets a registration link to send
(Domino sends no mail yet, so you send it yourself). The link is a
single-use key bound to that e-mail address, valid for seven days; the
same page can mint a new one, which retires the old, and can invite
someone directly without an application. ADR 0004 has the reasoning.

The owner is the first account created on an empty installation, recorded
as `platform_role = 'owner'` on the user. To hand it to someone else, or to
a second person, use the maintenance script on a checkout
(`pnpm script scripts/grant-owner.ts you@example.dk --only`) or, on the
server, one statement as the migration role in the database container:

```sql
update users set platform_role = 'owner' where email = 'you@example.dk';
```

It is never set from a request, and it is not the same thing as owning a
workspace: it says who may admit new workspaces to this installation,
nothing more.

## 6. The demo, if you want one

`DEMO` defaults to `off`, and while it is off `/demo` answers 404 and no
demo code runs at all. Set `DEMO=on` and every visitor to `/demo` gets
their own workspace with the example flows in it, signed in as a
throwaway account, deleted automatically after 24 hours.

That is a real workspace built by the real services, so what a visitor
sees is the product rather than a mock of it. Three things keep it
bounded: five demos an hour per address, two hundred live demos at once,
and an expiry on every one of them.

Cleanup runs on each visit, so an installation that gets visitors needs no
scheduler. If yours is quiet, or you would rather not rely on that, use
either:

```bash
pnpm script scripts/cleanup-demos.ts   # on a checkout; the images carry no scripts
curl -X POST https://domino.haij.dk/api/demo/cleanup   # on the server
```

The endpoint needs no secret because it can only delete demos that have
already expired.

Turn it on only where you mean it. A demo instance is not the same
installation as an organisation's own Domino: `DEMO=on` hands out accounts,
which is exactly what `SIGNUP=closed` exists to prevent. Run the demo on
its own installation with its own database, or accept that anyone can
create a workspace on this one.

The terms page at `/terms` tells visitors what a demo is and asks them not
to put real personal data in one; if you host a demo, read that page and
make sure it says what you actually do.

## 6b. Mail: there is none

Domino sends no mail. Admission links and workspace invitation links
(Settings → Workspace, ADR 0008) are shown to the person who made them,
who sends them the way they talk to their colleague anyway. There is no
SMTP setting, no scheduled job and no reminder; an installation needs
nothing beyond what section 2 lists.

## 7. Nightly encrypted backups (EU object storage)

Per the family's dogmas: nightly encrypted dumps to EU-owned object storage
(e.g. Hetzner Object Storage or a Storage Box). The script lives in this
repository at `scripts/backup-domino.sh`. On the VPS:

```bash
# Generate the key pair on your own machine, not on the server.
age-keygen -o domino-backup.key            # keep this in your password manager
grep 'public key' domino-backup.key        # the public half goes on the server

install -m 700 scripts/backup-domino.sh /root/backup-domino.sh
echo 'age1...' > /root/domino-backup.pub   # the public key from above
rclone config                             # configure an EU remote named eu-storage
/root/backup-domino.sh                     # run it once by hand
```

```
# crontab -e
25 2 * * * DB_CONTAINER=<domino db container id> /root/backup-domino.sh
```

Name the container explicitly: on a server that also runs Haij there is
more than one database container called `db`, and the script's fallback
picks the first one it finds.

Thirty days is what the terms page promises a workspace whose data has
been deleted, so the script keeps thirty at both ends: `KEEP_DAYS`
prunes the dumps on the VPS and `rclone delete --min-age` prunes the
bucket. Change one and you have changed a promise — change the sentence
in `terms.leaving.body` with it.

Keep the age private key offline, never on the server: a backup an attacker
on the server can decrypt is not a backup, it is a second copy of the leak.
Test a restore at least quarterly — an untested backup is a hope, not a
plan:

```bash
age -d -i domino-backup.key domino-2026-01-01.dump.age | pg_restore -d domino_restore
```

Any new storage, mail or model provider goes into `docs/subprocessors.md`
first.

## 8. Updating

Push to `main` → Coolify redeploys. The `migrate` service runs before the
new app container starts, so migrations are always applied first. Keep
migrations backwards compatible with the previous app version (expand →
migrate → contract) once real users are on the installation.

After each deploy, the About page is the check: if the commit shown is not
the one you pushed, the deploy did not do what you think it did.

## 9. Moving provider (exit plan)

1. Provision a VPS at the new EU provider, install Coolify, connect the repo.
2. Set the same environment variables.
3. Restore the latest dump into the new `db` service (section 4).
4. Flip DNS. Everything is Docker + Postgres; nothing is provider-specific.
