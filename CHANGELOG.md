# Changelog

What changed, for people who run Domino. Decisions and their trade-offs
are in `docs/adr/`; this is the release view. Dates are the day the
change reached `main`.

## Unreleased

- **A bad item no longer costs the pile** (ADR 0014): a brick can be set
  to leave the item out and carry on; the run finishes and says how many
  were left out.
- **A failed run can be carried on from where it stopped**: the finished
  steps are taken as they were, and only what failed is done again.
- **An example can be kept on a brick's input**, so trying that brick —
  and the ones after it — needs no typing. Kept beside the flow, so it
  never makes a version and never leaves with an exported file.
- **A brick can carry a note**, drawn on the canvas for whoever opens
  the flow next.

## 0.9.0 — 2026-09-21

The first release: everything CLAUDE.md's five waves name, built and
run against a local model and Mistral's EU endpoint, and nothing yet
against a real pile (dogma seven; `docs/launch.md`).

- **The flow format** (`docs/flow-format.md`, ADR 0011): one versioned
  JSON document, nine bricks, patches in the document's own words,
  import and export as one file, forward migration. Validation in two
  grades (ADR 0012): an error refuses, a loose end is kept and shown.
- **The canvas**: auto-layout, a panel per brick, connections drawn or
  picked, undo, history with revert, a brick tried on its own.
- **Talking a flow into existence**: the start screen, the conversation,
  every proposal a diff on the canvas until a person says yes, marked
  as the model's in the history.
- **Runs**: files with the text pulled out at upload (PDF, Word, text),
  a test run on one example, the whole pile, every step recorded as it
  happens, cancel, a table output as a spreadsheet, the run's own
  ceilings (ADR 0013).
- **The AI per brick**: a prompt finished, a schema from an example, a
  failed run explained with a fix to accept.
- **The foundation** (ADR 0001–0010): passkeys and TOTP, workspaces
  separated by RLS with a test proving it, admission by invitation, an
  append-only audit log, a demo workspace per visitor, a workspace's own
  model and key, export and deletion of a whole workspace.

Upgrading: there is nothing to upgrade from. A fresh installation runs
six migrations.
