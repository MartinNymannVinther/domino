# Domino

Domino ([domino.haij.dk](https://domino.haij.dk)) is an open source visual
flow builder for AI workflows, made for the ordinary employee who does
not program: line the bricks up in order — an input, a language model, a
schema, a document, an if, a loop, a combine, a template, an output — and
push the first one. Read two hundred applications, pull the five most
important points out of each, and put them in a table. Test it on one
example, run it on the whole pile, watch it happen brick by brick, and
run it again next month.

The most important thing in the tool is that you can talk your way to a
flow. The first screen is not an empty canvas but a field where you
describe what you want, beside a few example flows to start from; the
model proposes a complete arrangement that lands on the canvas ready to
be edited, and afterwards you stay in the conversation — "add a check
for whether the applicant is entitled to benefits", "make the summary
shorter" — and see every change as a diff you accept or undo.

Domino is one tool in the [Haij](https://haij.dk) family and stands on the
Haij foundation, taken by way of [Ajour](https://github.com/MartinNymannVinther/ajour)
and [Tavle](https://github.com/MartinNymannVinther/tavle): Danish-first,
EU-sovereign, secure by design. The project constitution — dogmas,
principles, architecture and rules — lives in [CLAUDE.md](CLAUDE.md).
Decisions and their trade-offs live in [docs/adr](docs/adr/). The flow
format is written down in [docs/flow-format.md](docs/flow-format.md).

## Status

0.9, waves 0 to 5 built: the foundation (auth with passkeys and TOTP,
workspaces separated in the database, admission by invitation, the
audit log, CI, Docker), the flow format and the engine, the canvas with
the panel per brick, the start screen that talks a flow into existence
and the conversation that shapes it, runs with files and a step-by-step
record, and the AI per brick — a prompt finished, a schema from an
example, a failed run explained with a fix. Everything here has run
against a local model on one machine; nothing has run a real pile yet.
Dogma seven is what 1.0 waits for, and [docs/launch.md](docs/launch.md)
is the road to it.

What that means for you: the code is public and you are welcome to run
it, read it, report what you find and send changes. Before 1.0 a
migration may still change its mind.

Much of the code is written together with Claude Code, under the rules
in [CLAUDE.md](CLAUDE.md). Every change is reviewed, tested and deployed
by a person; the tests for tenancy isolation are the part of the
codebase that is trusted least to good intentions.

## What it is

**A flow is one document.** Bricks and the connections between them, as
one JSON file ([docs/flow-format.md](docs/flow-format.md)). The canvas
draws it, a run follows it, the export is it. Every change — yours or
the model's — is a patch that makes a new version, and any version can
be brought back. There are no positions in it: the layout is computed,
so nobody arranges anything and two people see the same picture.

**Nine bricks, and not one more in 0.9.** Input (text, a file, a list).
Language model (a prompt with fields from earlier bricks). Structured
output (the same, answering in a schema). Document (the text out of a
file). If/else. Loop (start and end, once per item). Combine. Template.
Output (text, a table, JSON). Python and maths wait; the omissions are
the product.

**The AI proposes, you decide.** A whole flow from a description, a
change from a line in the conversation, a prompt finished, a schema
drafted from an example of your data, a failed run explained in plain
words with a fix — every one a proposal on the canvas until you say yes,
and marked as the model's in the history when you do. What you write
and what your documents contain is data to the model, never
instructions.

**Never a black box.** A test run on one example before the whole pile.
Every run shows what each brick took in and gave out, as it happens, and
the history keeps status, time and usage for every run.

**Runs where you say.** Mistral at the EU endpoint, or Ollama on your
own machine, behind one adapter; the installation sets the default and
a workspace may choose its own.

## Haij-dogmerne

Domino lever efter familiens syv dogmer. De står her i Haijs egne ord.

1. **Ægte open source.** Al kode ligger offentligt under AGPL-3.0. Alt vi driver, kan hentes 1:1 og køres et andet sted eller lokalt, og der findes ingen funktioner der kun kan fås på haij.dk. En betalt udgave er i orden, men den bygger på den samme kode. Kloner man repoet, får man præcis det der kører på haij.dk.

2. **Egen drift.** Hvert værktøj kan køre i eget driftsmiljø på én server med Docker Compose, en Postgres og en lokal sprogmodel gennem Ollama, uden en eneste nøgle til en sky. Funktioner der forudsætter en ekstern tjeneste, som CVR-opslag eller e-faktura, siger det direkte og lader resten virke i stedet for at gå i stykker. Testen er enkel: afbryd forbindelsen til internettet, og alt væsentligt skal stadig virke.

3. **Dine data, altid.** Alt en organisation ejer kan hentes ud med ét klik i åbne formater (regneark, JSON, PDF) uden at spørge nogen, og slettes helt igen. At forlade Haij skal kunne gøres med få klik uden unødvendig friktion, og vi hjælper gerne med flytningen frem for at gøre den besværlig.

4. **EU eller egen drift.** Når vi hoster, ligger alt hos EU-ejede leverandører på EU-jord, sprogmodeller inklusive, og hvert værktøj har en offentlig liste over hvem der kan se hvad. Ingen amerikansk sky i driften. Koden ligger på GitHub, som er kodehosting og ikke kundedata; et spejl hos en europæisk forge kommer den dag det giver mening.

5. **AI'en hjælper, mennesket bestemmer.** AI må foreslå, skrive udkast og rette i planer, men aldrig sende noget ud af ”huset”, slette noget eller forpligte nogen uden at et menneske har sagt ja. Alt AI gør, kan fortrydes. Indhold hentet udefra behandles som data, aldrig som instruktioner.

6. **Sikkerhed fra første dag.** Organisationers data er adskilt i databasen, ikke kun i koden, og der skal være en test der beviser det. Alle ændringer registreres i en log der ikke kan redigeres. Passkeys og totrinslogin er der fra start, der er en offentlig vej til at melde sikkerhedshuller, og der ligger aldrig hemmeligheder i koden.

7. **Brugt i virkeligheden.** Intet af det vi selv har bygget kommer i vinduet før det har kørt rigtigt arbejde, hos os selv eller hos en kunde vi sidder tæt på. Værktøjer fra andre skal have et rigtigt brugssted vi kan pege på. Vi skal ikke have værktøjer liggende som ikke har skabt reel værdi i virkeligheden.

## Quickstart

Requirements: Node 22+, pnpm 10+ (`brew install pnpm`; newer Node builds no longer bundle corepack), Docker.

```bash
git clone https://github.com/MartinNymannVinther/domino.git && cd domino
pnpm install
cp .env.example .env                            # defaults work for local dev
docker compose -f docker-compose.dev.yml up -d --wait  # Postgres 16 + runtime roles, ready
pnpm db:migrate                                 # tables, RLS, audit triggers
pnpm dev                                        # http://localhost:3000
```

Register at `/register` — signup creates your user and your workspace —
then add a passkey under Indstillinger → Sikkerhed. Registration is closed
by default (`SIGNUP=closed`): an empty installation always lets the first
person in, the door shuts by itself once that account exists, and everyone
after that applies at `/register` and is admitted by the installation's
owner with a single-use link (Indstillinger → Adgang). Colleagues do not
apply: a member of a workspace invites them with a link from Indstillinger
→ Arbejdsrum.

```bash
pnpm test        # RLS isolation, the export, the gates
pnpm lint && pnpm typecheck
```

The tests run against the database from the compose file and never call
an AI model, so they pass offline and without keys.

Two things the first run can trip over, both of which `pnpm db:migrate`
names when they happen. The Postgres image has to be pulled and the
cluster initialised the first time, so `--wait` matters; a migrate fired
before that is done fails and leaves an empty database behind. And if
another Postgres already holds port 5432 on your machine (Haij's, Ajour's
or Tavle's dev database, a local install), Domino's container comes up
without its port and the migration talks to the wrong server: set
`POSTGRES_PORT=5434` in `.env` and change the three URLs to match.

## Running it for real

[docs/launch.md](docs/launch.md) is the ordered checklist for taking an
installation live the first time, including the two steps that are painful
to get wrong: the public URL passkeys bind to, and creating the first
account before anybody else finds the address.
[docs/deploy.md](docs/deploy.md) is the deployment guide behind it: Docker
Compose on an EU VPS, with Coolify doing the plumbing. Which third parties can
see data, and what, is listed in
[docs/subprocessors.md](docs/subprocessors.md) — today that is the
hosting provider and the AI provider you choose. With `LLM_PROVIDER=ollama`
nothing leaves the server at all.

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) explains how changes are made here:
plan first, vertical slices, tests where they matter, an ADR for every
decision worth arguing about later.
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) covers how we talk to each
other. Found a security problem? Please report it privately as described
in [SECURITY.md](SECURITY.md) rather than in a public issue.

What we know is not right yet is written down rather than hoped away:
[TECH-DEBT.md](TECH-DEBT.md) lists it, with the reason it is still there
and what fixing it would take.

License: [AGPL-3.0](LICENSE). The two typefaces the interface is set in ship in `public/fonts`, both under the SIL Open Font License 1.1: Archivo by the Archivo Project Authors ([OFL.txt](public/fonts/OFL.txt)) and Geist Mono by the Geist Project Authors ([OFL-Geist.txt](public/fonts/OFL-Geist.txt)). The `.woff2` files are Google Fonts' own subsets, copied in so that a build needs no network.
