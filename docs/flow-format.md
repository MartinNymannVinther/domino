# The flow format

A flow is one JSON document. The canvas draws it, the engine runs it,
export hands it out, import takes it in, and every change — a person's
edit, an AI proposal a person accepted, an undo — is a patch on it that
produces a new version. There is one format and one version number for
all of that, and this file is its specification. The executable
specification is `src/modules/flow/schema.ts` (zod); when the two
disagree, the code is wrong and this file is corrected too.

This is version **1** of the format. The format is versioned from the
first commit so that a file exported today can still be imported after
the format has moved on: import reads `version`, migrates forward one
step at a time, and validates the result. A document with a `version`
higher than the installation knows is refused with a sentence that says
so.

## The document

```json
{
  "format": "domino.flow",
  "version": 1,
  "name": "Ansøgninger til skema",
  "description": "Læser hver ansøgning og trækker fem punkter ud.",
  "nodes": [ … ],
  "edges": [ … ]
}
```

| Field         | Type   | Notes                                                          |
| ------------- | ------ | -------------------------------------------------------------- |
| `format`      | string | Always `"domino.flow"`. What a file is, before anything else.  |
| `version`     | number | The format version. 1.                                         |
| `name`        | string | 1–120 characters.                                              |
| `description` | string | 0–2000 characters. What the flow is for, in the owner's words. |
| `nodes`       | array  | The bricks. At least one. At most 200.                         |
| `edges`       | array  | The connections. Each names a port on two nodes.               |

There is no position on a node. Layout is computed from the graph every
time it is drawn (dagre, left to right), so nobody has to place anything
and two people looking at the same flow see the same picture. A person
who drags a brick is reordering it among its siblings, not placing it
at a coordinate; the drag changes edges or the order of `nodes`, and the
layout answers.

Everything else a person can see on the canvas — a brick's title, its
settings, which port feeds which — is in the document. Everything the
document does not contain — a run's input, its output, its steps — is
not part of the flow and lives in the run tables.

## Nodes

```json
{
  "id": "n3",
  "type": "llm",
  "title": "Træk de fem punkter ud",
  "config": { … }
}
```

| Field     | Type   | Notes                                                                   |
| --------- | ------ | ----------------------------------------------------------------------- |
| `id`      | string | Unique in the document. `[a-z][a-z0-9_]{0,31}`. Stable across versions. |
| `type`    | string | One of the nine below.                                                  |
| `title`   | string | 1–80 characters. What the brick says on the canvas.                     |
| `config`  | object | Shaped by the type; each type's shape is a zod schema of its own.       |
| `onError` | string | `stop` (default) or `skip`. What a failure does to the run (ADR 0014).  |
| `note`    | string | 0–500 characters. A note to the next reader, drawn on the brick.        |

`onError: "skip"` leaves the brick's outputs unfilled when it fails —
which travels downstream as a skip, and inside a loop leaves that item
out of what the end collects — and the run carries on and finishes,
counting what was left out. `stop` ends the run at the first failure.
Both fields are optional with a default, so a document written before
they existed still reads.

Ids are stable on purpose: a patch names nodes by id, a run's steps name
nodes by id, and a person's follow-up in the conversation ("make the
summary shorter") is resolved by the model against the ids it can see.

### Ports

Every node has input ports and output ports, named per type. An edge
connects one output port to one input port. A port carries one value of
one kind: `text`, `json`, `list`, `file` or `boolean`. The schema knows
every type's ports and their kinds, and an edge between ports whose kinds
do not fit is a document that does not validate — the canvas will not
draw the connection, and the conversation's proposal is refused before
it is shown.

`list` is a list of values of one kind; `json` is an object that
conforms to a JSON Schema the producing brick declares.

### The nine types

**`input`** — where a run's input enters. No input ports.

```json
{ "kind": "text" | "file" | "list", "itemKind": "file" | "text", "label": "Ansøgninger", "hint": "Upload alle PDF'er" }
```

Output port `value`, of kind `text`, `file` or `list` (of `file` or
`text`, by `itemKind`; files by default). The run's input is keyed by
the node id.

**`llm`** — a language model writes from a prompt.

```json
{
  "prompt": "Læs ansøgningen herunder og …\n\n{{n2.text}}",
  "temperature": 0.2,
  "maxTokens": 1000
}
```

Input ports are declared by the prompt: every `{{node.port}}` in it is
an input the brick expects, and the schema derives the ports from the
template so the canvas can draw them and validation can refuse a
reference to a port that is not connected. Output port `text`.

**`structured`** — the same, but the model answers in a schema.

```json
{
  "prompt": "…{{n2.text}}",
  "schema": { "type": "object", "properties": { … }, "required": [ … ] },
  "temperature": 0
}
```

`schema` is a JSON Schema, restricted to what a non-programmer's form
can express and the model can reliably fill: objects, strings, numbers,
booleans, enums, arrays of those, one level of nesting. Output port
`json`, whose declared schema is exactly `schema`; downstream bricks may
reference its fields as `{{n3.json.name}}`. At run time the answer is
checked against the schema; one that does not fit is sent back once
with the problems named, and a second miss fails the step.

**`document`** — the text out of a file.

```json
{ "maxChars": 60000 }
```

Input port `file`, output port `text`. PDF, DOCX and plain text; the
extraction happens once at upload and is read here, so a run does not
re-parse two hundred files.

**`branch`** — if/else.

```json
{ "condition": { "op": "contains" | "equals" | "notEmpty" | "gt" | "lt", "value": "…", "field": "haster" } }
```

One input port `value`; two output ports `yes` and `no`, each of the
input's kind. `field` names a property to look at when the input is
`json` (empty means the whole value); `equals` and `contains` compare
as text, case-insensitively; `gt` and `lt` read numbers, Danish
decimals included. Exactly one of the two ports fires per run; what
hangs off the other is skipped and its steps are written as `skipped`.
Skipping travels: a brick whose required input was skipped is skipped
too, a `combine` simply leaves the skipped input out (so two branches
can meet again in one), and a `loop_end` leaves a skipped item out of
its list.

**`loop_start`** / **`loop_end`** — once per item.

```json
{ "loopId": "l1" }
```

`loop_start` takes a `list` on `items` and emits one `item` per element;
`loop_end` with the same `loopId` takes `item` and emits `items`, the
list of what came back, in order. The pair is validated as a pair — a
start without an end, or a brick inside the loop that reaches outside
it, does not validate. Loops do not nest in version 1.

**`combine`** — several things into one.

```json
{ "mode": "concat" | "merge" | "list", "separator": "\n\n" }
```

Input ports `a`, `b`, `c` … as connected (2–8); output `text` for
`concat` (the inputs as text, joined by `separator`), `json` for `merge`
(objects merged, anything else kept under the letter of its port),
`list` for `list` (lists flattened one level, so two piles become one).

**`template`** — text put together.

```json
{ "template": "Ansøger: {{n3.json.name}}\nPunkter:\n{{n4.text}}" }
```

Like `llm` without the model: input ports from the template, output
`text`.

**`output`** — what the run is for.

```json
{ "kind": "text" | "table" | "json", "label": "Skema" }
```

One input port `value`. `table` expects a `list` of `json` with a
declared schema and renders it as rows with the schema's properties as
columns, exportable as a spreadsheet through `src/core/xlsx`. The run's
output is keyed by the node id.

## Edges

```json
{ "id": "e5", "from": { "node": "n2", "port": "text" }, "to": { "node": "n3", "port": "n2.text" } }
```

| Field  | Type   | Notes                                            |
| ------ | ------ | ------------------------------------------------ |
| `id`   | string | Unique in the document, same shape as a node id. |
| `from` | object | A node and one of its output ports.              |
| `to`   | object | A node and one of its input ports.               |

An input port takes at most one edge; a required input with no edge is
a warning, not an error. An edge into a reference port
(`n2.text`) must come from the node and port the reference names. The
graph must be acyclic; a loop is expressed by its pair, not by an edge
back. The edges a prompt implies are derived from its text: when a
prompt gains or loses a `{{…}}`, the patch that changes it carries the
matching `addEdge` or `removeEdge`, and an imported file that has
prompts but no edges for them is given the edges on the way in. Every node other than an `input` must
have every declared input port connected, or the document does not
validate — a brick with an unconnected input is a run that would fail,
and the canvas says so before anybody runs it.

## Patches

A change to a flow is a list of operations. The vocabulary is the
document's own — nodes, edges, meta — not JSON Pointer paths, so that a
model can write one reliably, zod can validate it entirely, and the
canvas can draw it as a diff without computing one.

```json
{
  "ops": [
    { "op": "addNode", "node": { "id": "n7", "type": "branch", "title": "Ret til dagpenge?", "config": { … } } },
    { "op": "updateNode", "id": "n4", "title": "Kort sammenfatning", "config": { "prompt": "…" } },
    { "op": "removeNode", "id": "n5" },
    { "op": "addEdge", "edge": { "id": "e9", "from": { … }, "to": { … } } },
    { "op": "removeEdge", "id": "e3" },
    { "op": "setMeta", "name": "…", "description": "…" }
  ]
}
```

| Op           | Effect                                                                    |
| ------------ | ------------------------------------------------------------------------- |
| `addNode`    | Appends a node. Refused if the id exists.                                 |
| `updateNode` | Replaces `title` and/or `config` (whole, not merged). Type cannot change. |
| `removeNode` | Removes the node and every edge that touches it.                          |
| `addEdge`    | Appends an edge. Refused if the id exists or a port is already taken.     |
| `removeEdge` | Removes the edge.                                                         |
| `setMeta`    | Sets `name` and/or `description`.                                         |

Applying a patch is a pure function: `apply(document, patch) → document`
or a refusal naming the op that failed. The result is validated whole
before it is stored. Validation has two grades (ADR 0012): an _error_ —
an id used twice, a port that does not exist, kinds that do not fit, a
circle, a loop without its pair — refuses the patch; a _warning_ — an
input with nothing connected, a combine with fewer than two inputs, no
output brick — is stored with the version, drawn on the brick, and
refuses only a run.

A patch is stored with the version it produced, so the history can say
what changed without diffing two documents. The diff the canvas draws
after an AI proposal is the same list: added nodes and edges in one
colour, changed nodes in another, removed ones faded — and "accept"
applies it while "undo" discards it.

## Versions

Every version is the whole document plus the patch that produced it,
numbered 1, 2, 3 … per flow, with who made it (`user` or `ai`) and a
line about why. Undo is a new version whose document is an older
version's and whose message says so; nothing is ever deleted from the
history. Export writes the current version's document; import validates
a document, migrates it if it is older, and stores it as version 1 of a
new flow.

## Values at run time

What a port carries between steps is JSON: a string for `text`, an
object for `json`, an array for `list`, `true`/`false` for `boolean`, and
for `file` a reference `{ "fileId": "…", "name": "…", "mime": "…" }` to
a row in `files`. A run's steps record the input and output of every
brick in exactly this shape, so a person reading a run sees what the
brick saw.
