# ADR 0006: A workspace can choose its own model

Status: accepted · Date: 2026-09-04

Until now the language model belonged to the installation: `LLM_PROVIDER`,
`LLM_MODEL` and `MISTRAL_API_KEY` in `.env`, one answer for everybody on
the server. That is right for a single-tenant installation and wrong for
a hosted one, where two workspaces on the same server can have entirely
different views on where their text may go and who should pay for it.

So a workspace can now pick its own provider, its own model name and its
own API key in Settings → AI. Absence is the normal state: with no row,
the workspace inherits the installation's configuration, which is what
almost everybody should do and what a fresh installation does on its own.

## What a workspace may set, and what it may not

Provider, model name and key. Not the Ollama address.

An address field would read as the natural companion to the other three,
and it would turn every workspace member into somebody who can make the
server issue requests to a host of their choosing — the inside of a
network included. The installation owns the address; the workspace owns
the model. A person self-hosting has `.env`, which is where an address
belongs anyway.

The key is optional even for a hosted provider. A workspace on Mistral
with no key of its own keeps using the installation's, which makes
"change the model, keep the key" the single-field change it should be.
The settings page says which key is in force, because "it works" and
"somebody else is paying" are different facts.

Only owners and administrators may change any of it. A member who can
edit flows has no business changing what the workspace spends or which
company reads its documents.

## The key at rest

AES-256-GCM, with the encryption key derived from `BETTER_AUTH_SECRET`
through HKDF and a fixed info string, so this use cannot be replayed
against another use of the same secret. The alternative was a second
environment variable dedicated to encryption.

The trade-off accepted: one secret to protect, one fewer step in the
deploy guide, and one fewer way to end up with a half-configured server —
at the price that rotating `BETTER_AUTH_SECRET` makes stored keys
unreadable. That price is paid deliberately and made cheap: an unreadable
key is treated everywhere as no key at all, so a rotation costs each
affected workspace a re-entry of its key and costs the installation
nothing. Sessions are already invalidated by such a rotation, so the day
it happens is a day everybody notices anyway.

The ciphertext never enters the audit trail. The blanket redaction list
from ADR 0003 gained `api_key_cipher`, so the log records that a
workspace changed its model and who did it, without keeping a copy of the
secret in a table designed never to forget. The form is write-only in the
same spirit: it can say a key is stored and offer to replace or remove
it, and it never sends one back to the browser.

## What follows from it

`getLlmProvider()` still answers for the installation and is what the
environment test and the health checks use. Everything that runs on
behalf of a workspace goes through `resolveLlmConfig()` and
`workspaceLlmProvider()` instead, which is what `askForJson()` in
`src/modules/ai/service.ts` calls. There is no rules engine behind it: a
workspace with no model gets buttons that say so, and a workspace that
sets its provider to "none" gets that deliberately, even on an
installation with a model configured.

`docs/subprocessors.md` can no longer state a single processor for the
whole installation, and now says so: the hosted instance's default is
named there, and a workspace that chooses otherwise has chosen its own
processor and can see which one on its own settings page.
