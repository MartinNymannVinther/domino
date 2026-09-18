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

### The demo seeds nothing yet

`createDemoWorkspace` builds a workspace, an account and a cookie, and
lands on an empty flow list. The example flows it should open with are
decided together with the start screen (wave 3) and seeded with the demo
(wave 5); until then `DEMO=on` demonstrates the foundation and nothing
else.

### The AI ceilings are Tavle's numbers

60 calls per user per hour and 600 per workspace per day (ADR 0009) were
sized for a team adding cards. A run over two hundred documents is two
hundred calls in one go. The runner (wave 4) brings its own accounting
and an ADR amending 0009; until then the inherited ceilings bound only
the conversation and the assists, which is what exists.

## Accepted, with the reason written down

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

### What a person needs to see when a run fails

The steps record input and output, and the model can explain a failure.
Whether that is enough — whether the person wants to retry one item,
skip it, or edit the brick and resume from the step that failed — is
what the first real pile will say.
