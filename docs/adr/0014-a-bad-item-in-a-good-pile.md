# ADR 0014: A bad item in a good pile — carrying on, taking over, and keeping an example

Status: accepted · Date: 2026-09-23 · Amends: 0011, 0012

## Context

The first thing a real pile does is contain one bad document. Until
now the engine stopped the whole run at the first brick that failed: a
scanned PDF at number 47 cost the other 199, and the only way forward
was to remove the file and run everything again — paying for every
model call a second time. TECH-DEBT named this as a question for the
first real pile; n8n, which has had real piles for years, answers it
with three separate mechanisms, and all three earn their place here.

The same weeks showed the smaller version of the problem while
building: trying one brick means filling its inputs by hand every
time, and what was typed is gone as soon as the panel closes.

## Decision

**A brick says what happens when it fails.** Every node carries
`onError`: `"stop"` (the default, and what every flow did before) or
`"skip"`. A brick set to skip records its failure as a failed step,
leaves its outputs unfilled — which travels downstream as a skip, and
inside a loop leaves that item out of what the end collects — and the
run carries on. The run finishes as `done` with `failed_steps` counted,
and the page says how many items were left out. It is a per-brick
choice because the answer differs per brick: a document that cannot be
read is one applicant lost, and a missing model is every applicant
lost.

**A failed run can be taken over rather than redone.** `resumeRun`
makes a new run on the same version with the same input, naming the
old one in `resumed_from`. The engine is handed the finished steps of
that run and takes each as it was — same values, no model call, a row
marked `reused` — and does again only what failed and what follows it.
It is refused when the run did not fail, or when the flow has moved on
since: the steps were recorded against a document that no longer
applies, and a half-old, half-new run is worse than an honest rerun.

**An example can be fastened to a brick's input.** A pin is a value on
`(flow, node, port)` in `flow_pins`, offered as the starting point when
the brick is tried on its own. It lives beside the flow and not in the
document: a pin is not a change to the flow, it would otherwise make a
version every time it changed, and it must not travel with an exported
file, since it is usually a page of somebody's document. It does travel
in the workspace's own export, like every row the workspace owns, and
the audit row about it carries no value.

**A brick can carry a note.** `note` on every node, drawn on the brick
in the sticky colour the design tokens already held. It is a field on
the brick rather than a tenth brick type: the nine are a promise, and
a note that floats has to be placed, which the format refuses to do
(ADR 0011).

`onError` and `note` are additive fields with defaults, so a document
written before them still reads and the format stays at version 1.

## Alternatives rejected

- **A retry with backoff per brick**, n8n's other answer. A model that
  answered badly is already asked again (the structured brick), and a
  document that cannot be read will not read on the third attempt. When
  a real pile shows a flaky provider, this is the next thing to add.
- **Resuming inside the same run row.** It would lose the record of
  what the first attempt did, and the steps are the record (ADR 0011).
  Two runs, one naming the other, keeps both.
- **Pins in the document.** n8n does this, and it is why an n8n
  workflow file can carry a customer's data. One version per pinned
  example, and an export that leaks — two reasons, either enough.

## Trade-offs accepted

- **`skip` can turn a broken flow into a quiet one.** A prompt that
  fails on every item leaves an empty table and a done run with 200
  failed steps. The count is on the run, the page says it in words, and
  the steps are all there — but nobody is woken up.
- **A resumed run's totals are its own.** Tokens and time count what
  this run did; what the first one spent is on the first one. The chain
  is readable through `resumed_from`, and nothing adds them up yet.
- **A pin can go stale.** The brick's prompt changes, the example does
  not, and the test is then about last week's flow. It is the person's
  own example to let go of, and the panel says when one is in use.
