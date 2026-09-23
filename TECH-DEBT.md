# Tech debt

What we know is not right yet, why it is not right, and what fixing it
would take. A debt item is written down when it is discovered and moved
to **Paid** when it is done — an item nobody can find is an item nobody
pays.

CLAUDE.md's ways of working point at this file; this is it.

Opened at wave 0, September 2026, when the foundation was taken from
Tavle and the product did not yet exist. What is here was inherited with
the foundation, checked against this repository's code, and kept only
where it still applies. **Check an item against the code before acting
on it.** A debt file that is trusted without being checked is worse than
no file.

Three kinds of item live here, and they are kept apart on purpose. What
is **open** is wrong and worth fixing. What is **accepted** is a
boundary we chose, written down so nobody re-discovers it as a bug. What
is **waiting for a real pile** is a product question we refuse to answer
from the armchair (dogma seven).

## Open

### Files over 300 lines

One responsibility per file and no file over roughly 300 lines. Five
inherited files are over it, none of them the product's:

| lines | file                                                  | the seam                                             |
| ----- | ----------------------------------------------------- | ---------------------------------------------------- |
| 371   | `tests/access/admission.test.ts`                      | the application, the invitation, the registration    |
| 369   | `tests/rls/tenant-isolation.test.ts`                  | the roles' reach vs. the coverage meta-tests         |
| 332   | `app/[locale]/(app)/settings/access/access-admin.tsx` | the applications list vs. the invitation form        |
| 318   | `core/access/service.ts`                              | applications vs. invitations                         |
| 304   | `core/db/schema/foundation.ts`                        | Better Auth's tables vs. the audit log and admission |

They are the family's, not Domino's; a split here is a split the other
tools would want too, and is better made once and carried across than
made four times. The product's own files start at zero and stay under
the line.

### The runner is one process, in order

Runs are claimed oldest first, one at a time, by the web process (ADR
0013). A long run delays the next, and a second instance of the app
would be a second runner without coordination beyond `FOR UPDATE SKIP
LOCKED` — correct, but each instance also fails every run left
`running` when it starts, which on a rolling deploy fails the other
instance's run in flight. One server, one process is the stated shape;
a pool, a heartbeat and a resume are the answer when a real pile asks.

### Proposals are written by the client, not the route

The conversation's route answers with the model's reply and patch; the
client then stores the exchange with `recordExchangeAction` (ADR 0008
keeps the model call off the action queue). A browser that closes
between the two loses the exchange, and a client could store a reply
the model never gave. The second is harmless — a proposal is validated
again when accepted, and only the workspace's own flow can be touched —
but the shape is two trips where one would do. A route that stores as
it answers, with the same guard, is the cleaner shape.

### The canvas draws small

Auto-layout puts a flow of seven bricks in a row, and the canvas fits
it to the width, so the bricks are small on a laptop until the person
zooms. A layout that wraps long chains, or bricks that show less at a
small zoom, are both possible; which one is the calmer picture is a
question for a person who has used it for a week.

### The chosen structured fields cannot be nested from the form

The schema editor writes strings, numbers, booleans and choices; a
nested object or a list of objects — which the model may propose and
the format allows — is shown as "advanced" and left alone. Editing it
means the conversation or a file. Enough for 0.9; a form for one level
of nesting is small work when somebody needs it.

## Accepted, with the reason written down

### pdf.js gets a six-number DOMMatrix

pdf.js asks for a `DOMMatrix` global at load and, in Node, reaches for
`@napi-rs/canvas` to get one — a native binary per platform that the
standalone build does not trace, and that a text extractor has no use
for. `src/modules/files/extract.ts` stands a class of six numbers in
before importing pdf-parse, and the worker file is traced in by name in
`next.config.ts`. Text extraction is proven on a PDF in
`tests/files`; anything that renders a page — nothing in Domino does —
would find the stand-in wanting.

### The content policy still allows inline scripts

`next.config.ts` sends a Content-Security-Policy, and it blocks
everything Domino never uses: no external scripts, no framing, no
`<base>`, no form posting off-site. But `script-src` keeps
`'unsafe-inline'`, because Next.js writes its own bootstrap inline and
next-themes writes the one that sets the theme before first paint.

Closing it means a per-request nonce, set on the _request_ headers in
`src/proxy.ts` so Next stamps it onto its own scripts — and composed with
`next-intl`'s middleware, which builds its own response and will not
carry modified request headers by itself. It also forces every page to
render dynamically, which `src/app/[locale]/layout.tsx` currently avoids
with `generateStaticParams` and `setRequestLocale`.

That is a real trade with a real cost. It deserves its own change, with a
test, not a line in a hardening pass.

### Rate limiting is per process

`src/core/rate-limit.ts` counts in memory, which is correct for one
container behind one proxy and says so. An installation scaled to several
instances gets a limit per instance rather than a limit. The file is
written so that it is the only one to replace; the call sites do not
change.

### The workspace model key is bound to its workspace, but old ciphertexts are not

`src/core/crypto/secret-box.ts` seals as `v2` with the workspace id as
additional authenticated data, so a stored key only opens for the
workspace it was stored for. `v1` values are still read, without that
binding, for installations upgraded from an older foundation. Domino has
never written a `v1` value; the read path can go the day the family's
other tools no longer need it.

### The date helpers are wider than the product

`src/core/dates.ts` carries week numbers, plan-date arithmetic and three
formatters, all inherited and all tested. Domino uses the two stamp
formatters and today's date. The rest stays because it is the family's
one calendar and a flow that runs on a schedule (roadmap, later) will
want it; it costs nothing while it waits.

## Waiting for a real pile

Not debt: product questions the tool refuses to answer from the armchair
(dogma seven). Each one is a decision somebody will ask for, and the
answer should come from a person who ran into it with real documents.

### How big a file, how many items in a run

Twenty megabytes per file and five hundred items per run are the first
numbers (docs/flow-format.md, ADR 0011). A case worker with a thousand
applications, or a scanned PDF of eighty pages, is the reason to change
either — not a guess about them.

### 600 calls per workspace per day, runs included

ADR 0013 counts a run's calls against the workspace's day and keeps the
number ADR 0009 set: three piles of two hundred and the fourth waits.
Whether the number should be a setting, or the runs should have a day
of their own, is a question for the first workspace that reaches it.

### What a person needs to see when a run fails

The steps record input and output, the model can explain a failure, a
brick can be set to leave a bad item out, and a failed run can be taken
over from where it stopped (ADR 0014). What is still open is the
smallest unit: retrying **one item** of a pile rather than the run, and
editing the brick before taking over. The first real pile decides
whether either is missed.
