# ADR 0011: One document, one patch — the flow format and everything that changes it

Status: accepted · Date: 2026-09-18

## Context

Domino's owner named the trap before the first line was written: a flow
builder tends to grow three mechanisms for one thing — the canvas's own
state for editing, an export format for files, and a diff or undo layer
bolted on later — and the three drift until "import what I exported"
and "undo what the AI did" mean different things. The most important
feature, talking a flow into existence and then talking it into shape,
depends on changes being something that can be shown, accepted and
reverted as one unit.

## Decision

**A flow is one JSON document,** specified in `docs/flow-format.md` and
validated by one zod schema in `src/modules/flow`. The canvas draws it
and nothing else; the engine runs it; export writes it; import reads it.
There is no position in it — layout is computed from the graph — so the
document is the flow's meaning, not its picture.

**Every change is a patch, and every patch is a version.** A patch is a
list of operations in the document's own vocabulary (`addNode`,
`updateNode`, `removeNode`, `addEdge`, `removeEdge`, `setMeta`), not
JSON Pointer paths: a model writes it reliably, zod validates all of it,
and the canvas draws it as a diff without computing one. Applying a
patch is a pure function whose result is validated whole before it is
stored. A person's edit on the canvas, a proposal from the conversation,
an undo — each is a patch that produces a new row in `flow_versions`,
carrying the whole document and the patch beside it, numbered, with who
made it and why. Undo is a version whose document is an older one's;
nothing is deleted from the history.

**An AI change is a proposal until a person says yes.** The model's
reply in the conversation carries a patch against the version it was
written for. It is stored on the message as `proposed`, drawn on the
canvas as a diff, and becomes a version only when accepted — through the
same `apply` as a person's own edit, with `actor_kind = ai` so the
history says whose hand it was. Rejected, it stays on the message as
what was not done.

**The format is versioned from day one.** `version: 1` in every
document; import migrates forward one step at a time and refuses what
it cannot read, by name.

**Files live in the database.** An uploaded document is a row in
`files` with its bytes and the text extracted from it at upload. One
Postgres is the whole state of an installation: a backup is a backup, a
deleted workspace takes its files with it through the cascade, and
there is no directory to secure, mount or forget. The audit trigger
redacts the bytes; the audit row says a file came and went.

**A run is a record, and the steps are the record.** A run is pinned to
the version it ran. Every brick the engine touches writes a `run_steps`
row per iteration with what went in and what came out, as it happens,
so the pieces are seen falling one by one and a failed run says which
brick, with what in hand. The run tables carry no audit trigger:
auditing a record is a copy, not a record (ADR 0003).

## Alternatives rejected

- **JSON Patch (RFC 6902).** General, standard, and wrong for a model to
  write: a path is a string that can point anywhere, the diff on the
  canvas would have to be reconstructed from paths, and the validation
  of "is this a sensible change to a flow" would live outside the
  vocabulary. The domain ops are six, and each is a sentence.
- **Storing only patches and replaying.** Cheaper on disk, and a history
  that has to be replayed to be read. A flow document is a few kilobytes;
  storing it whole per version is what makes any version readable and
  any run pinned.
- **Positions in the document.** Every flow builder has them and every
  team fights over them. Auto-layout is the calm interface the owner
  asked for; a person reorders, never places.
- **Files on disk or in object storage.** A second store to secure,
  back up and delete, and a hosted installation that would need an EU
  object store on day one. The twenty-megabyte ceiling per file is the
  price, and it is the right one for applications and contracts.

## Trade-offs accepted

- **`flow_versions` grows by one document per change.** Bounded by the
  document's size and by how often a person changes a flow; a retention
  rule is a later decision.
- **A patch names nodes by id, so ids are load-bearing.** A model that
  invents an id, or a person who imports a document with clashing ids,
  is refused rather than guessed at.
- **Files up to twenty megabytes in a row.** A backup is bigger and a
  query that forgets to exclude `bytes` is slow. The column is selected
  by name where it is needed and nowhere else.
- **No nested loops in version 1.** A loop inside a loop is the first
  thing the format's version 2 is likely to be about; refusing it now
  is what keeps the engine and the canvas honest about what they draw.
