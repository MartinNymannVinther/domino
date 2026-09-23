# Decisions

Every significant decision in Domino is written down here, numbered in the
order it was taken, and says what trade-off was accepted rather than only
what was chosen. A decision is never rewritten once it is accepted: a
later one amends it and says so in both directions, so a reader who
arrives at the old number is told where the story continues.

This index is the way in. It is generated from the files' own titles and
status lines, so it cannot say something they do not — but it is checked
in, which means it has to be re-read when an ADR is added. The number of
the next one is the highest here plus one.

Where the product's own words live instead: **README.md** has the seven
dogmas in the family's voice, **CLAUDE.md** is the constitution every
session reads, and **TECH-DEBT.md** is what we know is not right yet.

| #                                           | Decision                                                                 | Relations      |
| ------------------------------------------- | ------------------------------------------------------------------------ | -------------- |
| [0001](0001-foundation-from-tavle.md)       | Domino stands on a copy of the Tavle foundation                          |                |
| [0002](0002-tenancy-rls.md)                 | Multi-tenancy enforced with RLS and two runtime roles                    |                |
| [0003](0003-audit-logging.md)               | Trigger-based, append-only audit log                                     |                |
| [0004](0004-admission-by-invitation.md)     | Admission by application and invitation                                  |                |
| [0005](0005-demo-workspaces.md)             | A demo workspace per visitor                                             |                |
| [0006](0006-workspace-chosen-models.md)     | A workspace can choose its own model                                     |                |
| [0007](0007-design-scale-and-tokens.md)     | A named small-text scale, and the last hard-coded values become tokens   |                |
| [0008](0008-ai-reads-on-their-own-route.md) | An AI read is a route, not an action                                     |                |
| [0009](0009-ai-installation-roof.md)        | The installation's own roof over the AI                                  | ← 0013         |
| [0010](0010-the-landing-mark.md)            | The landing mark — motion answers a move, not a gesture                  |                |
| [0011](0011-one-document-one-patch.md)      | One document, one patch — the flow format and everything that changes it | ← 0012, 0014   |
| [0012](0012-unfinished-is-not-broken.md)    | Unfinished is not broken — two grades of validation                      | → 0011, ← 0014 |
| [0013](0013-the-runs-own-ceilings.md)       | The run's own ceilings, and how a run gets its model calls               | → 0009         |
| [0014](0014-a-bad-item-in-a-good-pile.md)   | A bad item in a good pile — carrying on, taking over, keeping an example | → 0011, 0012   |
