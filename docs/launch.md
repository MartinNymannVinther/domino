# Launching Domino

The ordered list for the day this goes live. `docs/deploy.md` is the
reference and explains each piece; this is the sequence, with the things
that are easy to do in the wrong order called out.

Everything here is done once. If you are redeploying an existing
installation, you want section 8 of the deploy guide instead.

## 1. Make the repository public

The repository already exists — `origin` is
`git@github.com:MartinNymannVinther/domino.git`, `main` is pushed and CI
runs on it — but it is private, and dogma one is not satisfied by a
repository nobody can clone. What is left of this step is the flip.
Coolify deploys from a Git repository either way, so this is about the
dogma rather than about the deployment.

Check before the flip that `git status` is clean and that `git ls-files`
lists no `.env` — `.gitignore` covers both, and CI's gitleaks job is the
second line rather than the first. The check is cheap and the flip is
one-way: the whole history becomes public with it, and nothing about it
can be taken back afterwards.

```bash
gh repo edit MartinNymannVinther/domino --visibility public \
  --accept-visibility-change-consequences
gh repo edit MartinNymannVinther/domino \
  --description "Stil brikkerne op. Skub til den første. Visuel flow-bygger til AI-arbejdsgange, open source." \
  --homepage https://domino.haij.dk \
  --add-topic ai --add-topic workflow --add-topic llm --add-topic nextjs \
  --add-topic postgresql --add-topic open-source --add-topic danish
```

Issues are already on. Check that the CI run after the flip is green —
six jobs: quality, tests, build, image, audit, gitleaks. The audit job
runs `pnpm audit --prod`, which is clean as of the pre-release review;
`pnpm audit` on the whole tree still reports three advisories reached
only through the `shadcn` CLI, which is a development dependency and
never ships.

`.github/dependabot.yml` has been opening pull requests since the
repository was created — one grouped pull request a week for the npm
minor and patch traffic, majors on their own, plus GitHub Actions and
Docker base images — and going public changes nothing about that. Keep
reading them rather than merging them blind.

## 2. The Mistral key

Get an API key from the Mistral console and note which region the account
sits in. `docs/subprocessors.md` already names Mistral and the EU endpoint
the code calls; if the account turns out to be somewhere else, that row
has to say so before the first call is made, not after.

Keep the key out of the repository, out of your shell history and out of
this file. It goes in Coolify and nowhere else.

## 3. Server and DNS

Follow deploy guide section 1. A 2 vCPU / 4 GB VPS in an EU region is
enough, and Domino can share the machine with the other Haij tools —
separate compose stack, separate database, separate domain.

Point `domino.haij.dk` at the server before you create the application in
Coolify, so the certificate is issued on the first deploy rather than the
second.

## 4. The application in Coolify

Deploy guide section 2. The environment variables, generated fresh —
never reused from another installation:

```
POSTGRES_PASSWORD     openssl rand -hex 24
DOMINO_APP_PASSWORD    openssl rand -hex 24
DOMINO_AUTH_PASSWORD   openssl rand -hex 24
BETTER_AUTH_SECRET    openssl rand -base64 32
BETTER_AUTH_URL       https://domino.haij.dk
LLM_PROVIDER          mistral
MISTRAL_API_KEY       the key from step 2
DOMINO_COMMIT          the short commit being deployed
```

Hex for the three database passwords: they are pasted into
`postgres://user:PASSWORD@db:5432/domino`, and a `/` from `base64` would
end the URL there and produce a startup error that names the URL rather
than the password. `BETTER_AUTH_SECRET` does not go into a URL and stays
base64.

`SIGNUP` stays unset: it defaults to `closed`, which is what an
installation on the open internet should be. `DEMO` stays unset for now
— step 7 turns it on deliberately, after you have your own account.

`BETTER_AUTH_URL` is the one that hurts to get wrong: passkeys bind to
the origin they were created for, so changing it later locks out anyone
who registered a passkey against the old value. Set it to the final
public URL before anybody signs in.

## 5. First account, and closing the door behind it

Deploy the application, wait for it to come up, and check `/api/health`
and `/api/version` answer.

Then go straight to `https://domino.haij.dk/register` and create your
account. **This is the one that matters.** An empty installation lets the
first person in and shuts the door the moment that account exists; if
anyone else finds the address first, they become the installation's owner.
Do it within minutes of the first successful deploy, not the next morning.

Add a passkey immediately afterwards under Indstillinger → Sikkerhed, and
TOTP as the second factor. Verify that Indstillinger → Adgang is there —
that is the owner's page, and its presence is the proof the first account
got `platform_role = 'owner'`.

## 6. Backups, before there is anything to lose

Deploy guide section 7: nightly encrypted dumps to EU object storage.
Set it up now rather than after the first real pile, and then do the
thing almost nobody does — restore one dump into a scratch database and
open it. A backup nobody has restored is a hope, not a backup.

## 7. Turn the demo on

Set `DEMO=on` in Coolify and redeploy. Open `https://domino.haij.dk/demo`
in a private window and check that you land on the flows with the demo
stripe at the top, that an example flow opens and its history is there,
and that `/register` still shows the application form rather than a
sign-up form.

Be clear-eyed about what this does: `DEMO=on` hands out throwaway
accounts on this installation. That is the point of a public instance
whose job is to show the tool, and it is exactly what you would not do on
an organisation's own Domino. The accounts and their workspaces expire
after 24 hours and cleanup runs on every visit.

Read `/terms` on the live site once, out loud if necessary. It is the page
that tells visitors what happens to what they type, and it should say what
you actually do.

## 8. Dogma seven

> Intet af det vi selv har bygget kommer i vinduet før det har kørt
> rigtigt arbejde.

Pick a real pile and run it through a real flow. Not a test set, not a
copy of one — two hundred applications somebody has to answer, where a
wrong summary costs somebody something. One full run is enough to learn
what a v1 is missing; retrying a single item and resuming from a failed
step are the likeliest first answers, and they should be findings rather
than guesses.

Until that has happened, the tool card on haij.dk waits.

## 9. The tool card

The copy for the card is written with the finish (CLAUDE.md, wave 5) as
`docs/haij-tool-card.md`, in both languages, with the proposed entry for
the site's `tools.ts`. It belongs in the haij.dk repository, not this one.

## Afterwards

Watch three things in the first weeks. What the AI costs per real week of
use, which tells you whether Mistral or Ollama is right in the long run.
Whether anyone applies at `/register`, which tells you the card is doing
its job. And how often you reach for something Domino deliberately does not
have — that list is in CLAUDE.md under product principles, and the
omissions are the product until reality says otherwise.
