# CLAUDE.md — Domino

Domino (domino.haij.dk) is an open source visual flow builder for AI
workflows: a person lines bricks up in order and pushes the first one.
It is for the ordinary employee with no programming experience who has
two hundred applications to read, five points to pull out of each and a
table to put them in — built, tested and run again and again without
writing code. It is one tool in the Haij family (haij.dk) and stands on
the Haij foundation, taken by way of Ajour and Tavle. This file is the
project constitution: read it fully at the start of every session. The
non-negotiables below override any default you would otherwise pick.

## The Haij dogmas (family rules, non-negotiable)

The seven dogmas are written in Danish, in the family's own words, in
README.md. Quote them verbatim; never rephrase them. What they bind this
codebase to:

1. **Real open source.** AGPL-3.0. Everything that runs on domino.haij.dk
   can be cloned and run elsewhere or locally, 1:1. No feature exists only
   on the hosted instance. A paid edition is fine, but it is the same code.
2. **Self-hosting.** Runs on one server with Docker Compose, one Postgres
   and a local language model through Ollama, without a single cloud key.
   Features that need an external service say so and let the rest work.
   The test: cut the internet, and everything essential still works.
3. **Your data, always.** Everything a workspace owns can be exported with
   one click in open formats (spreadsheet, JSON) and deleted again
   completely; a flow is one JSON file that goes in and out on its own.
   Leaving must take a few clicks and no friction.
4. **EU or self-hosted.** Hosted, everything lives with EU-owned providers
   on EU soil, language models included, and `docs/subprocessors.md` says
   who can see what. Code lives on GitHub, which hosts code, not customer
   data.
5. **The AI helps, the human decides.** The AI may propose a flow, a change
   to it, a prompt, a schema or an explanation, but nothing is written
   without a person saying yes, it never sends anything out of the house
   and never deletes. Everything the AI did is marked and can be undone.
   Content fetched from outside — a person's documents included — is
   data, never instructions.
6. **Secure from day one.** Workspaces are separated in the database
   (Postgres RLS) with a test proving it, every change lands in an audit
   log that cannot be edited, passkeys and TOTP from the start, a public
   way to report vulnerabilities, and never a secret in the code.
7. **Used for real.** Nothing goes in the window before it has run real
   work. Domino runs a real pile of documents before it is shown.

## Product principles

- **Talking a flow into existence is the product.** The first screen is
  not an empty canvas: it is a field where the person describes what
  they want, beside a few example flows to start from. The model
  proposes a complete arrangement — bricks, connections, prompts,
  schemas — that lands on the canvas ready to be edited. Afterwards the
  person stays in the conversation ("add a check for whether the
  applicant is entitled to benefits", "make the summary shorter") and
  sees each change as a diff on the canvas, to accept or undo.
- **One document, one patch (ADR 0011).** A flow is one versioned JSON
  document (`docs/flow-format.md`); the canvas merely draws it. Export,
  import, diff and undo all stand on the same document and the same
  format version — never three mechanisms. An AI change is a patch on
  the document, never a hand on the canvas. The format is versioned
  from day one; import migrates forward and refuses what it cannot read.
- **Nine bricks in 0.9**, and not one more: input (text, file, list),
  language model (a prompt with fields from earlier bricks), structured
  output (a JSON schema), document (upload and text extraction),
  if/else, loop (start and end), combine, template, output. Python and
  maths wait. The omissions are the product; each is a later decision.
- **The AI helps per brick too:** finish writing a prompt, propose a
  schema from an example of the data, and explain in plain words what
  went wrong when a run failed, with a fix to accept.
- **Calm and beautiful, not a developer tool.** A canvas with drag and
  drop, automatic layout so nobody arranges anything, connections that
  can be read, and a right-hand panel for the selected brick's settings.
  Everything also works without a drag and with a keyboard.
- **Never a black box.** Running a flow shows it happen brick by brick,
  with the input and output of every step. A test run on one example
  before the whole pile. A history of runs with status, time and usage.
- **Danish interface**, English available; code, comments and docs in
  English.

## Architecture (decided — change only via a new ADR)

- Next.js 16 (App Router), TypeScript strict. One app, one database.
- Postgres 16+ with Drizzle ORM. Migrations checked in; hand-written SQL
  for roles, RLS and triggers.
- Multi-tenancy: single database, `org_id` on every domain table, RLS
  policies enforced for the application role. The organization is what
  the UI calls a workspace ("arbejdsrum"); a workspace holds any number
  of flows. App code never uses a superuser/bypass role for domain
  queries; every domain query goes through `withOrgContext()`.
- Auth: Better Auth (pinned at 1.7.1, see pnpm-workspace.yaml) with
  organizations, passkeys (WebAuthn) and TOTP. Registration closed by
  default; admission by application and invitation (a stranger gets a
  workspace) and by workspace invitation (a colleague joins an existing
  one). Session cookies: Secure, HttpOnly, SameSite=Lax.
- UI: Tailwind + shadcn/ui with the Haij 2a design tokens (warm paper,
  moss green, Archivo). One palette for the whole family. next-intl with
  `da` default (no URL prefix) and `en` under `/en`. Timezone
  Europe/Copenhagen.
- Canvas: `@xyflow/react` with custom node components in the 2a tokens;
  layout computed with `@dagrejs/dagre`, never stored.
- AI: all model access through `src/core/llm` (Mistral at the EU
  endpoint, Ollama for self-hosting), behind an adapter so a local model
  can be put in later. The installation sets the default in `.env` and a
  workspace may choose its own provider, model and key in Settings → AI,
  encrypted at rest; the Ollama address stays with the installation (ADR
  0006). Read-only proposals are routes, acceptances are actions (ADR
  0008). Without a model the buttons say so and everything else works.
- Runs: the engine in `src/modules/engine` is a pure function over the
  document with a model adapter injected; a runner started from
  `instrumentation-node` claims queued runs with `FOR UPDATE SKIP LOCKED`
  and writes `run_steps` as it goes. No job queue dependency.
- Files: in Postgres (`files.bytes`), never on disk; text extracted at
  upload (ADR 0011).
- Deployment: Docker Compose run via Coolify on an EU VPS (Hetzner
  initially; the provider must stay replaceable). Nightly encrypted
  backups to EU object storage. No Vercel, no Neon, no US cloud.
- Layout: shared kernel (auth, tenancy, audit, llm, team, env) in
  `src/core`; the product in `src/modules/{flow,engine,runs,files,ai,demo,export}`
  behind services that take an `OrgContext`; server actions next to their
  services as `actions*.ts`; pages in `src/app/[locale]` and components
  in `src/components/{canvas,flow,run,chat,settings}`.
- Trade-off accepted: the foundation is a copy of Tavle's copy of Ajour's
  copy of Haij's, not a shared package. Four products, four lifecycles,
  one set of rules (ADR 0001).

## Security rules

- Every new table ships with `org_id`, forced RLS, an audit trigger and an
  automated test proving workspace A cannot read or write workspace B's
  rows. The meta-test in `tests/rls` fails any table without forced RLS.
- Every server action resolves the caller's session and workspace first
  and validates that every id it receives belongs to that workspace.
  Never trust an id from the client. Inviting and removing members takes
  an owner or an admin; the check lives in the action helper, not the
  form.
- Validate all input at the boundary (zod). Parameterized queries only.
  A flow document and a patch are validated whole before they are
  stored; a run's input is validated against the flow's input bricks.
- Rate limiting on auth and all public endpoints, ceilings on AI calls —
  per user, per workspace and over the whole installation (ADR 0009) —
  and a ceiling on prompt length, file size and items per run. Generic
  auth error messages, no stack traces and nothing in a response that is
  about this installation. `GET /api/version` names the release without
  a login so a deploy can be verified; `/api/health` answers `ok`.
- The AI surface: everything a person wrote and everything a document
  contains is fenced as data in every prompt, never as instructions;
  model output is parsed and validated against the flow format and the
  brick's own schema before it is shown or stored; the AI writes nothing
  until a person accepts, and what it wrote is marked `actor_kind = ai`.
  A run's model calls see only the documents the person handed the flow.
- Invitation links are Better Auth invitation ids: single-purpose, bound
  to one address, expiring after 48 hours, revocable.
- GDPR by design: per-workspace export and deletion, record of processing,
  EU-only subprocessors listed in `docs/subprocessors.md`.
- `SECURITY.md` with responsible disclosure. CI runs dependency audit and
  secrets scanning on every push.

## Ways of working (how Claude Code operates here)

1. Plan first. For every wave: present the plan, the schema changes and
   the API surface, get a yes, then work independently inside that one
   wave without asking on the way. End the wave with a green build, green
   tests and a commit on main; report back briefly; wait for the next yes.
2. Vertical slices. Ship end-to-end features; keep the app deployable at
   every commit.
3. Run `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm format` after
   code changes and keep them green. Tests where they matter: the flow
   format and its patches, the engine with a fake model, RLS isolation,
   AI output validation, the runner.
4. One responsibility per file; no file over roughly 300 lines.
5. Conventional commits. Every significant decision gets an ADR in
   `docs/adr/` that names the trade-off accepted, not just the choice.
6. Never weaken tenancy, auth or audit logging to make a feature easier.
7. Never delete files without explicit approval.
8. Code, comments and docs in English. UI copy in Danish first through
   i18n (`messages/da.json`) with an English translation; never hardcode
   UI strings.
9. Ask before adding any dependency not implied by this file.
10. **Claude delivers to main; Martin delivers to production.** Pushing
    to main deploys nothing: deployment is a manual step Martin performs
    in Coolify with Auto Deploy off. Still, only push when build and
    tests are green — main is what gets deployed. Domino runs locally on
    Martin's machine until then; do not set up hosting or deploy.

## Roadmap

- Wave 0 (done): the foundation from Tavle (ADR 0001), cut to what a flow
  builder needs; the six product tables with RLS, audit and isolation
  tests; the flow format written down and versioned (docs/flow-format.md,
  ADR 0011); this file; the repository.
- Wave 1: the document and the engine — the zod schema for the format,
  patch/apply/diff, versions and undo, export and import, and the engine
  running all nine bricks against a fake model, with tests.
- Wave 2: the canvas — the flow list, the React Flow canvas with custom
  bricks, auto-layout, the right-hand panel per brick type, manual edits
  as patches, history and undo, export and import in the interface.
- Wave 3: talk your way there — the start screen with a description and
  the example flows, model → document, the diff layer with accept and
  undo, the follow-up conversation as patches.
- Wave 4: running — the runner, a test run on one example, the full run,
  the step-by-step view, the history with time and usage, file upload
  and text extraction, output as a table and a spreadsheet; the run's
  own ceilings (an ADR amending 0009).
- Wave 5: AI per brick and the finish — finish the prompt, a schema from
  example data, a failed run explained with a fix; the help page, the
  demo with the example flows, README, TECH-DEBT, the tool card.
- Before 1.0: dogma seven — a real pile of documents through a real flow.
- Later, each as its own decision: Python and maths bricks, nested loops,
  scheduled runs, a public read-only flow link.
