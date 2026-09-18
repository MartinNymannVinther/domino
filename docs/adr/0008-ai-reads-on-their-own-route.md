# ADR 0008: An AI read is a route, not an action

Status: accepted · Date: 2026-09-18 (inherited from Tavle, ADR 0034 there)

## Context

Tavle found this the hard way: Next runs the server actions of one
client strictly one at a time, so an AI assist implemented as a server
action — a model thinking for twenty seconds — held every write the
person made in the meantime, and a cancelled dialog could still land its
queued write half a minute later. A read had taken a write hostage,
which is dogma five upside down.

Domino's AI surface is almost entirely reads of that kind: a proposal for
a whole flow from a description, a patch from a line in the
conversation, a prompt finished, a schema drafted from an example, a
failed run explained. Every one of them is "look at this and propose",
and none of them writes a row until a person says yes.

## Decision

**A read-only AI proposal is served from a route handler, not a server
action**, through the one door `aiRead` in `src/modules/ai/read-route.ts`
— which keeps everything an action keeps: `requireOrgContext()` first,
zod at the boundary, the ceilings on calls counted before the model is
asked, user prose fenced as data, the answer validated before it is
shown. The transport changed; nothing else did.

**A write is never behind a read.** Accepting a proposal, saving a brick,
starting a run: server actions, leaving the moment they are clicked.

**A call that is no longer wanted is abandoned.** Every read carries an
`AbortController`; a closed panel or a newer question drops the older
call in the browser. The server finishes the model call it started, and
it is already counted against the ceilings.

## Trade-off accepted

Two doors into the AI — proposals on routes, acceptances as actions — and
a reader has to know which is which. A route returns data, not a
revalidation, so an AI read never refreshes the page on its own; that is
right for a read, and it is exactly why the boundary is drawn at "writes
nothing".
