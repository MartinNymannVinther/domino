# ADR 0012: Unfinished is not broken — two grades of validation

Status: accepted · Date: 2026-09-18 · Amends: 0011

## Context

ADR 0011 says a patch that leaves a brick unconnected is refused as a
patch, not stored as a broken version. Building the canvas made the
cost of that sentence visible: a person who adds a brick has, for a
moment, a brick with nothing connected to it. Refusing that moment
means every addition has to arrive with its connections in one patch,
which is possible for a model writing a whole flow and unbearable for a
person building one brick at a time. The format's promise that matters
is that nothing broken is run and nothing broken is drawn as if it were
fine; it is not that nothing is ever half-finished.

## Decision

Validation has two grades, and every problem carries one.

**An error refuses the document.** An id used twice, an edge to a port
that does not exist, kinds that do not fit, a circle, a loop without
its pair, a field read off a text port: these are documents that are
not flows, and no version, import or proposal that contains one is
stored.

**A warning is stored, shown, and refuses only a run.** A required
input with nothing connected, a combine with fewer than two inputs, a
flow with no output: these are flows that are not finished. The
version is written, the canvas marks the brick and says what is
missing, and the run button says why it will not start. A person can
leave for the day with a loose end and find it marked in the morning.

The set of warning codes is named in one place
(`src/modules/flow/problems.ts`); everything not in it is an error.
Import gives a hand-written file the edges its prompts imply before it
judges the whole, so a file that named its references and forgot its
edges arrives finished rather than warned.

## Alternatives rejected

- **A client-side draft that is validated only on save.** Two states
  for one document, the second of which is lost on a refresh, and a
  diff layer that would have to understand both. One document, one
  patch (0011) rules it out.
- **Additions that always arrive wired.** Calm for the common case and
  wrong for a combine, a branch or a loop, each of which has an edge
  that cannot be known at the moment the brick is added.

## Trade-offs accepted

- **A stored version can be one that cannot run.** The history says so
  on every such version, and a run is refused before a row is written.
  The word "valid" in the format's specification now means "no errors",
  and the specification says which is which.
- **The model's proposals are held to the same two grades.** A proposal
  with warnings is shown, accepted and marked; the conversation is told
  what is left. Refusing it outright would refuse most first drafts.
