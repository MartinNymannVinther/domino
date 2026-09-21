# Subprocessors

Per the Haij dogmas, every subprocessor must be EU-owned and EU-hosted,
and must be listed here **before** it is taken into use. This is the
public list of who can see what for the installation at domino.haij.dk. A
self-hosted Domino with `LLM_PROVIDER=ollama` or `none` has no
subprocessor at all beyond the machine it runs on.

| Subprocessor        | Purpose                                                                                                                                          | Data                                                                                                                                                                                                                   | Location                                      | Added      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| Hetzner Online GmbH | Hosting: the VPS running Docker and the database                                                                                                 | Everything the installation holds                                                                                                                                                                                      | Nuremberg, DE                                 | 2026-09-18 |
| Mistral AI          | LLM adapter: the conversation that builds a flow, the per-brick assists, the explanation of a failed run, and every model brick when a flow runs | What a prompt contains: the person's description and follow-ups, the flow document, the prompts and schemas in its bricks, and — when a flow runs — the text of the documents the person handed it. Written out below. | EU/EFTA data centres, via `api.eu.mistral.ai` | 2026-09-18 |

Domino sends no mail, so there is no mail provider on this list and there
will not be one without a row here first.

## What each one does and does not see

**Hetzner** hosts the machine, so it holds everything by definition: the
database, the backups on their way out, the logs. That is unavoidable for
any hosted deployment and is why the choice of provider matters and why
the exit plan in `docs/deploy.md` is a design requirement rather than a
nicety.

**Mistral** is a French company, and that is not by itself the answer to
where the data goes. Mistral runs three endpoints: `api.mistral.ai`,
`api.eu.mistral.ai` and `api.us.mistral.ai`, and they state that they do
not commit to any particular inference location for the first of them.
Domino calls the EU one, and `MISTRAL_BASE_URL` in the environment is what
decides it, so it is an installation's choice and not a workspace's. The
regional endpoints cost 1.1x list price; that is what this row costs.

Mistral receives what a prompt contains and nothing else. Every AI
surface in 0.9 is written out here; a surface that is not on this list
does not exist:

- **The start screen and the conversation**: the person's description
  or follow-up line, the flow document as it stands, and the last few
  turns of the conversation about it. Never a run's data.
- **The assists per brick**: the flow's name and description, the
  brick's own prompt or schema, and the example the person pasted for a
  schema to be drafted from.
- **A brick tried on its own**: exactly what the person handed the
  brick's inputs — which may be a document's text when they took it from
  the last run.
- **A failed run explained**: the flow document, the failing brick and
  the input and error of the step that failed — which may include a
  document's text, since that is what the brick was reading.
- **A run**: every model brick sends its prompt with the fields
  it references filled in, which means the text of the documents the
  person uploaded and whatever earlier bricks produced from them. This
  is the one surface that carries a person's documents by design; a
  workspace whose documents must not leave it runs `LLM_PROVIDER=ollama`,
  which is the reason that option exists.
- **The connection test** under Settings → AI carries nothing from the
  workspace: one fixed sentence — "Svar med præcis ét ord: OK" — so that
  "configured" and "working" can be told apart.

No prompt carries a person's account name or e-mail. What a document
contains is the person's own responsibility to know; the terms say so.

## A workspace can choose a different one

Since ADR 0006, a workspace may set its own provider, model and API key in
Settings → AI. Mistral is the default on domino.haij.dk and the one this
list covers, and it is what every workspace uses until it says otherwise.
A workspace that chooses differently has chosen its own processor: its
text then goes to the provider named on its own settings page, under
whatever agreement it has with them, and this list no longer describes
it. A workspace that sets the provider to "none" sends nothing to any
model at all; every AI surface says so and everything else works.

The Ollama address is not part of that choice — it belongs to the
installation — so on the hosted instance the real options are Mistral or
no model. The key a workspace stores is encrypted at rest and is never
readable from the interface; the settings page says which key is in force,
the installation's or the workspace's own.

Passwords, passkeys, session tokens, the audit log, invitation ids and
anything belonging to another workspace are never sent. Everything a
person has written is placed in the prompt as data, never as instructions,
which is the prompt-injection defence rather than a privacy measure —
both matter, for different reasons.

## Not subprocessors, but worth naming

**GitHub** holds the source repository. It processes no installation
data, so it is a development dependency rather than a subprocessor, but
it is US-owned and that is worth stating plainly rather than leaving for
a reader to discover. Nothing about the installation's operation depends
on it: the deployment runs from a Docker image, and the repository can be
mirrored or moved without touching production.

**Let's Encrypt** issues the TLS certificate and therefore learns the
hostname, which is public in DNS anyway.

Adding anything to this list is a decision, not a formality. Before a new
row goes in: what data does it receive, could the feature work without
sending it, and what happens to the installation the day that provider
disappears.
