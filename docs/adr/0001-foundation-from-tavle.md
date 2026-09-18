# ADR 0001: Domino stands on a copy of the Tavle foundation

Status: accepted · Date: 2026-09-18

## Context

The Haij family has a foundation that is proven three times over. Haij,
the business platform, built it — Better Auth with passkeys and TOTP,
organizations with Postgres RLS enforced through two confined database
roles, an append-only audit log written by triggers, admission by
application and invitation, CI with dependency audit and secrets
scanning, Docker Compose deployed through Coolify, the 2a design system.
Ajour, the project tool, took a copy (Ajour's ADR 0001) and added what a
product built on it needs: per-workspace model settings, the demo
workspace per visit, a self-explaining migrator, the security headers,
the deploy and launch guides. Tavle, the board, took a copy of that
(Tavle's ADR 0001), added the second door — a colleague joining a
workspace by invitation — and ran it through fourteen testers and an
adversarial pass: the typefaces moved into the repository so a build
needs no network, the small-text scale got names, AI reads moved onto
their own route, the installation got a roof over its model calls,
Better Auth was pinned where the schema holds.

Domino is the fourth tool: a visual flow builder where a person lines
bricks up and pushes the first one. It needs the same foundation and
nothing the three products added on top of it.

## Decision

Domino is its own repository and its own application, deployed as its
own compose stack on domino.haij.dk. Its foundation is a copy of
Tavle's, taken at Tavle commit `06176c0` and adapted: the same stack
(Next.js 16, Postgres 16, Drizzle, Better Auth 1.7.1, Tailwind +
shadcn/ui, next-intl, pnpm, Vitest), the same tenancy model (ADR 0002),
the same audit model (ADR 0003), the same admission model (ADR 0004),
the same demo mechanics (ADR 0005), the same workspace-chosen models
(ADR 0006), the same design tokens and shell (ADR 0007), the same AI
door (ADR 0008) and roof (ADR 0009), the same CI gates and deployment
shape. Every Tavle-specific module (boards, the backlog structure,
sprints, the story map, the roadmap, the metrics, the roster, the
PowerPoint export) was removed rather than disabled. The schema starts
from four migrations: the foundation, its security, the product and the
product's security — the two later Tavle migrations that touched the
foundation (the installation roof, the owner's error code) are folded
into them, since Domino has no installations to migrate.

Taken from Tavle rather than from Ajour because Tavle's copy is Ajour's
copy plus the hardening, and every one of those changes is one Domino
would otherwise make again.

The runtime roles are `domino_app` and `domino_auth`, the environment
variables `DOMINO_*`, the invitation headers `x-domino-*`, the cookie
`domino-sidebar`, so the family's tools can share one Postgres cluster
and one browser without colliding.

## Alternatives rejected

- **A module inside Tavle or Ajour.** An AI workflow is neither a board
  nor a plan; the concepts overlap in nothing but the foundation, and
  the people at the door are different — a case worker with two hundred
  applications, not a team.
- **A shared `haij-core` package.** Four consumers is well past where a
  package boundary starts to pay for itself, and it may yet be
  extracted. Not now, for the reason Tavle gave: the copy is confined to
  `src/core`, the migrations and the tests, drift can be reviewed by
  diff against the named commit, and a foundation that has to serve
  four products at once changes more carefully than one that serves
  each on its own.
- **An existing open source flow builder.** Several exist and some are
  good; none is built for a person who does not program, and none keeps
  the dogmas. The foundation that keeps them is worth more than a
  feature list that does not.

## Trade-offs accepted

- **Four copies of the foundation.** A fix in Haij's, Ajour's or Tavle's
  auth, tenancy or audit code does not reach Domino by itself. Bounded
  by keeping the copied code unchanged where possible and naming the
  commit it came from.
- **Four accounts for one person.** A shared identity across the family
  is a later decision that must not be forced by a shortcut.
- **Better Auth's vocabulary leaks.** Tables are named organizations and
  memberships while the UI says workspace. Renaming the library's tables
  buys nothing and costs every future upgrade.
