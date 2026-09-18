# ADR 0009: The installation's own roof over the AI

Status: accepted · Date: 2026-09-18 (inherited from Tavle, ADR 0035 there; the numbers are provisional, see below)

## Context

`src/modules/ai/limits.ts` counts model calls: 60 per user per hour, 600
per workspace per day. Both are counted inside `withOrgContext`, so
neither can see past one workspace: a person in three workspaces has
three times the first, and an installation with `DEMO=on` — a workspace
per visitor — has no total at all. Dogma two is the other half: on a
self-hosted installation with Ollama a call costs nobody money, and a
roof a self-hoster cannot take off would be the tool deciding how much
of their own machine they may use.

## Decision

**A third ceiling, the installation's**, counted across every workspace
over a rolling 24 hours, set with `AI_DAILY_CALL_CAP` (default 2000) and
taken off entirely with `0`. It is counted by `ai_calls_last_day()`, a
`SECURITY DEFINER` function that returns one number and never a row
(drizzle/0001): the application role still sees only its own workspace's
`ai_calls` rows, and gains exactly the one aggregate it could not
otherwise compute. `tests/ai/limits.test.ts` drives the counter past the
roof and asserts the refusal, because a function that silently returned
0 would be a roof that never speaks.

## Trade-offs accepted

- A shared roof is a shared fate: a workspace that has spent nothing can
  be refused because another spent everything, and the sentence it gets
  does not say which.
- It is a ceiling, not a quota: two calls landing together can both read
  the count below the line and both go through.
- A member learns one aggregate about the installation, one refusal at a
  time.

## Provisional, and why

Tavle's numbers were sized for a team adding cards. Domino's ordinary
use is a run over two hundred documents — two hundred model calls in one
go, by one person, in one workspace. The per-user and per-workspace
ceilings as inherited would refuse the product's own example before it
finished. The runner (roadmap, wave 4) counts a run's calls per step and
brings its own ceilings — per run, and a run's share of the day — in an
ADR of its own; until then these three stand as inherited, and the
conversation and the per-brick assists are what they bound.
