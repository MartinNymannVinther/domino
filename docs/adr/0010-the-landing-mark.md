# ADR 0010: The landing mark — motion answers a move, not a gesture

Status: accepted · Date: 2026-09-18 (inherited from Tavle, ADR 0038 there)

## Context

A thing that just moved — dragged, reordered by an arrow, placed by the
model — arrives without a word, and the eye has to find it. The obvious
answer is to animate the drag itself. Tavle rejected that: a flying
element would be the only thing of its kind in a calm interface, it
crosses between components with different markup, and the drag is never
the only way to make the move — every move also exists as a menu, a
select or a button, and those deserve the same answer.

## Decision

**The answer is the landing, not the flight.** `.landed` in
`src/app/globals.css` lays a moss tint over the element for 1100 ms
(`LANDED_MS` in the hook that applies it) and fades it out; under
`prefers-reduced-motion` the tint stands for the same second and simply
stops. It is laid over the element as a pseudo-element rather than set
as its background, because the element has a ground of its own and
animating that would fade it to nothing on the way out.

For Domino this is the brick that just landed on the canvas — after a
drag, after auto-layout moved it, after an accepted proposal added it —
and the row in the history that just changed state.

## Trade-off accepted

One more thing on the page that moves. It is a second of tint on the
element that changed and nothing else, which is the smallest motion that
answers the question "where did it go".
