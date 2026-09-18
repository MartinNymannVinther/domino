import { EXAMPLE_FLOWS } from "@/modules/flow";

/**
 * The flow format, told to the model (docs/flow-format.md, in the
 * words a model writes from). Short on purpose: the schema does the
 * judging, this only has to make a first draft that mostly fits, and
 * the problems it gets back name what did not.
 */
export const FLOW_FORMAT_RULES = `A flow is one JSON document:
{ "format": "domino.flow", "version": 1, "name": "...", "description": "...", "nodes": [...], "edges": [...] }

Ids match [a-z][a-z0-9_]{0,31} and are unique across nodes and edges; use n1, n2 ... for nodes and e1, e2 ... for edges. Every node is { "id", "type", "title", "config" }. Titles are short, in the person's language. The nine node types, their config and their ports:

- input: config { "kind": "text"|"file"|"list", "itemKind": "file"|"text", "label", "hint" }. No inputs. Output port "value" (text, file, or list of itemKind). Where a run's input enters.
- document: config { "maxChars": 60000 }. Input port "file" (file). Output "text". The text out of an uploaded file. Always put one after an input of kind file, or after a loop_start over files.
- llm: config { "prompt", "temperature": 0.2, "maxTokens": 1000 }. Output "text". The prompt names what it reads with {{nodeId.port}}, e.g. {{n2.text}}; every such reference is an input port named "n2.text" and needs an edge from n2.text to it.
- structured: config { "prompt", "schema", "temperature": 0, "maxTokens": 1000 }. Output "json". Like llm, but answers in "schema": a JSON Schema object with "properties" of type string (optionally "enum"), number, integer, boolean, or array/object one level deep, and "required". Later prompts read its fields as {{n3.json.fieldName}}.
- template: config { "template" }. Output "text". Text put together from references like llm, without a model.
- branch: config { "condition": { "op": "contains"|"equals"|"notEmpty"|"gt"|"lt", "value": "...", "field": "..." } }. Input "value" (any). Outputs "yes" and "no", each carrying the input on. "field" names a property when the input is json; equals/contains compare as text; a boolean field compares with value "true".
- loop_start: config { "loopId": "l1" }. Input "items" (list). Output "item" (one element). loop_end: config { "loopId": "l1" } with the same id. Input "item". Output "items" (the list of what came back). Everything between the pair runs once per item and must lead back to the loop_end; no loops inside loops; no output inside a loop.
- combine: config { "mode": "concat"|"merge"|"list", "separator": "\\n\\n" }. Inputs "a", "b", "c" ... (2 to 8). Output "text" for concat, "json" for merge, "list" for list. Two branches can meet here: a branch not taken is simply left out.
- output: config { "kind": "text"|"table"|"json", "label" }. Input "value". "table" takes a list of json (a loop_end after a structured brick) and shows the schema's fields as columns.

Edges: { "id": "e1", "from": { "node": "n1", "port": "value" }, "to": { "node": "n2", "port": "file" } }. An input port takes one edge. The edge into a reference port "n2.text" comes from node n2, port "text". Kinds must fit: text to text, file to file, a list to loop_start.items, json to a branch that looks at a field.

A flow needs at least one output. Prompts are written in the person's language, address the model directly, say exactly what to do and what to answer with, and end with the references to the material.`;

/** One example, as JSON, so the model has seen a whole one. */
export function exampleFlowJson(key: "applications" | "summary" | "triage"): string {
  return JSON.stringify(EXAMPLE_FLOWS.find((e) => e.key === key)!.document);
}
