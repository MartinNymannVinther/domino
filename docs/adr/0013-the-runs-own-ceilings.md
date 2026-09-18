# ADR 0013: The run's own ceilings, and how a run gets its model calls

Status: accepted · Date: 2026-09-18 · Amends: 0009

## Context

ADR 0009 put three ceilings on the AI surface: calls per person per
hour, per workspace per day, and the installation's roof over all of
it. They were sized for a person typing — a draft here, a proposal
there. A run is different in kind: one person chooses a pile of two
hundred documents once, and a flow with a loop asks the model two
hundred times on their behalf. Counted against the person's hour, the
run would stop at sixty and the person would have done nothing wrong.
Not counted at all, a loop with a bug would run until the bill arrived.

## Decision

**A run counts against the workspace and the installation, never
against the person's hour.** Every model call the runner makes is a
row in `ai_calls` with kind `run`, checked before the call against the
workspace's day and the installation's roof (`reserveRunCall`,
src/modules/ai/limits.ts). The hourly ceiling stays what it was: a
ceiling on a person's own asking.

**A run has ceilings of its own** (src/modules/runs/ceilings.ts):
at most 500 items across its list inputs, 5,000 steps, 1,000 model
calls, and 200,000 characters in a text input. They are refused before
a row is written where they can be — a pile too big never becomes a
run — and end the run by name where they cannot.

**A run stops when asked.** The engine looks at the run's status before
every step; a cancel lands within one step, and the steps already
written stay as the record of what happened.

**One process runs the runs.** The runner lives in the web process,
polling every two seconds, claiming through a definer's-rights function
with `FOR UPDATE SKIP LOCKED` (drizzle/0005) — the one place the
application role looks across workspaces, and it hands back three ids.
`RUNNER=off` moves it to a second process when a deployment wants one.
A run still marked running when a process starts was interrupted by
that process stopping, and is failed by name.

## Alternatives rejected

- **A separate ceiling on runs in the environment.** A fourth number
  to explain; the workspace's day already bounds spend, and the run's
  own ceilings bound size. An installation whose model costs nothing
  turns the roof off, as 0009 allows.
- **A job queue.** A dependency, a second service to run and back up,
  for a queue that Postgres already keeps. Dogma two.

## Trade-offs accepted

- **A workspace's day is 600 calls, runs included.** Three piles of two
  hundred in a day, and the fourth waits for tomorrow. The number is a
  constant in the code and a self-hoster changes it there; making it
  a setting is a later decision.
- **The hourly ceiling can be reached by a run's owner in the
  conversation while the run is going.** The two are separate on
  purpose; a person shaping the next flow is not slowed by the one
  running.
- **One runner, in order.** Runs are taken oldest first, one at a time;
  a long run delays the next. Two processes are possible (`RUNNER`), a
  pool is not, yet.
