# ADR 0007: A named small-text scale, and the last hard-coded values become tokens

Status: accepted · Date: 2026-09-18 (inherited from Tavle, ADR 0024 there; the review it records was of Tavle)

## Context

A full design review found the 2a look eroding at the edges: twenty
different arbitrary `text-[...]` sizes between 0.65rem and 0.95rem
(0.78 next to 0.8125 in the same file — a half-pixel "step" no eye
reads as hierarchy), sticky-note shadows with the light theme's ink
baked in as rgba, two different page scrims for dialog and sheet, white
text on the sand and sage theme swatches, three focus-visible dialects
with none at all on the map and chart links, and the same dashed
"a thing can go here" affordance drawn in two greys.

## Decision

**Four named steps below `text-sm`,** declared in the theme and used
everywhere the small sizes lived: `text-2xs` (0.69rem — keys, pills,
chips, bar labels), `text-xs` (redefined to 0.72rem — property labels,
meta lines), `text-2sm` (0.8125rem — compact controls, list-row and
note titles), `text-reading` (0.9375rem — prose surfaces). An
arbitrary bracket size in a className is drift; pick a step.

**Tokens for the rest.** `--scrim` dims the page identically under
dialog and sheet, in both palettes and without a backdrop blur.
`--note-shadow`/`--note-shadow-hover` carry the sticky notes' lift
(Tavle's story map) in palette ink; `--radius-xs` (0.3rem) is the note's corner.
Theme swatches gained an ink partner (`themeInk`): paper ink on the
deep swatches, the page's ink on sand, sage and clay — white on sand
is not writing. One `.focus-ring` utility is the focus for links and
card-like things; the field components keep their soft ring. The
dashed affordance is always `border-input` (it must read on the
`bg-secondary/60` wells) and left-aligned, per the 2a empty-state
rule. The recessed grounds have names — well `/60`, band `/40`,
inset `/20` — named where the canvas's tokens are declared.

## Trade-off accepted

Redefining `text-xs` moves every existing use by 0.03rem, and the
absorbed sizes (0.78 → 0.8125, 0.95 → 0.9375) shift by up to a
half-pixel — accepted, because one calm rhythm across board, map,
roadmap and chart is worth more than any of those individual values.
The dark palette's sage and clay bars keep imperfect contrast; dark
mode is derived, not designed, and fixing it properly is its own
decision.
