import type { LlmMessage } from "@/core/llm";
import {
  applyPatch,
  LIMITS,
  outputPortNames,
  Patch,
  referencesIn,
  StructuredSchema,
  type FlowDocument,
  type FlowNode,
  type Problem,
} from "@/modules/flow";
import { DATA_RULE, fenceUntrusted, languageRule } from "./prompting";
import type { Ask } from "./propose-flow";

/**
 * The AI per brick (CLAUDE.md, product principles): finish writing a
 * prompt, propose a schema from an example of the data, and explain in
 * plain words what went wrong when a run failed, with a fix to accept.
 * Each is a read that answers with a proposal; each answer is parsed
 * and validated before it is shown; nothing is written until a person
 * says yes.
 */

export const MAX_EXAMPLE_CHARS = 8000;

/** What a brick can refer to: every earlier output, as `{{id.port}}` with its title. */
function available(doc: FlowDocument, nodeId: string): string {
  return doc.nodes
    .filter((n) => n.id !== nodeId)
    .flatMap((n) =>
      outputPortNames(n).map((port) => `{{${n.id}.${port}}} — ${n.title} (${n.type})`),
    )
    .join("\n");
}

export function promptMessages(doc: FlowDocument, node: FlowNode, locale: string): LlmMessage[] {
  const current =
    node.type === "template"
      ? node.config.template
      : node.type === "llm" || node.type === "structured"
        ? node.config.prompt
        : "";
  return [
    {
      role: "system",
      content: [
        `You write the ${node.type === "template" ? "template" : "prompt"} for one brick in a workflow built by a person who does not program. Answer with one JSON object: {"text": "..."}.`,
        node.type === "template"
          ? "A template is text put together from references; no model reads it."
          : "The prompt addresses a language model directly: say exactly what to do and what to answer with, in a few clear sentences, and end with the references to the material it should read.",
        node.type === "structured"
          ? "The brick answers in a fixed schema; the prompt should tell the model to fill every field and what each means."
          : "",
        "References look like {{n2.text}} and may only name what is listed as available. Keep any reference the current text already uses unless it is clearly wrong.",
        languageRule(locale),
        DATA_RULE,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        `The flow: ${fenceUntrusted(`${doc.name}\n${doc.description}`, 3000)}`,
        `The brick: ${fenceUntrusted(node.title, 200)}`,
        node.type === "structured"
          ? `Its schema: ${fenceUntrusted(JSON.stringify(node.config.schema), 4000)}`
          : "",
        `Available references:\n${available(doc, node.id) || "(none)"}`,
        current
          ? `The current text, to finish or improve:\n${fenceUntrusted(current, LIMITS.prompt)}`
          : "The text is empty; write it.",
        'Answer with {"text": "..."}.',
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export type TextProposal =
  { ok: true; text: string } | { ok: false; reason: "badAnswer"; problems: string[] };

export async function proposePrompt(
  doc: FlowDocument,
  nodeId: string,
  locale: string,
  ask: Ask,
): Promise<TextProposal | null> {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node || (node.type !== "llm" && node.type !== "structured" && node.type !== "template"))
    return null;
  const answer = await ask(promptMessages(doc, node, locale), { maxTokens: 1500 });
  const text = readText(answer);
  if (!text) return { ok: false, reason: "badAnswer", problems: ["no text"] };
  const unknown = referencesIn(text).filter(
    (ref) => !doc.nodes.some((n) => n.id === ref.node && outputPortNames(n).includes(ref.port)),
  );
  if (unknown.length)
    return {
      ok: false,
      reason: "badAnswer",
      problems: unknown.map((r) => `unknown reference ${r.raw}`),
    };
  return { ok: true, text: text.slice(0, LIMITS.prompt) };
}

function readText(answer: unknown): string {
  const record =
    typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>) : {};
  return typeof record.text === "string" ? record.text.trim() : "";
}

export function schemaMessages(example: string, hint: string, locale: string): LlmMessage[] {
  return [
    {
      role: "system",
      content: [
        'You design the schema a language model must fill for one brick in a workflow. Answer with one JSON object: {"schema": { "type": "object", "properties": { ... }, "required": [ ... ] }}.',
        "Properties are of type string (with an enum when the values are a fixed set), number, integer, boolean, or an array or object one level deep. Property names are short, without spaces, in the person's language; every property has a one-sentence description.",
        "Read the example of the data and name the fields a person would want out of it — the ones they name, if they named any; otherwise the ones the example plainly holds. Five to ten fields is usual.",
        languageRule(locale),
        DATA_RULE,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        hint ? `What the person wants out: ${fenceUntrusted(hint, 1000)}` : "",
        `An example of the data:\n${fenceUntrusted(example, MAX_EXAMPLE_CHARS)}`,
        'Answer with {"schema": ...}.',
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export type SchemaProposal =
  { ok: true; schema: StructuredSchema } | { ok: false; reason: "badAnswer"; problems: string[] };

export async function proposeSchema(
  example: string,
  hint: string,
  locale: string,
  ask: Ask,
): Promise<SchemaProposal> {
  const messages = schemaMessages(example, hint, locale);
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const asked =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user" as const,
              content: `The schema did not fit: ${problems.join("; ")}. Answer again.`,
            },
          ];
    const answer = await ask(asked, { maxTokens: 2000 });
    const record =
      typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>) : {};
    const parsed = StructuredSchema.safeParse("schema" in record ? record.schema : record);
    if (parsed.success && Object.keys(parsed.data.properties).length > 0)
      return { ok: true, schema: parsed.data };
    problems = parsed.success
      ? ["no properties"]
      : parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`);
  }
  return { ok: false, reason: "badAnswer", problems };
}

export type FailedStep = { nodeId: string; iteration: number; input: unknown; error: string };

export function explainMessages(
  doc: FlowDocument,
  failed: FailedStep,
  runError: string,
  locale: string,
): LlmMessage[] {
  const node = doc.nodes.find((n) => n.id === failed.nodeId);
  return [
    {
      role: "system",
      content: [
        'A run of a workflow failed. Explain to the person who built it — not a programmer — what went wrong and what to do, in two to four plain sentences. Answer with one JSON object: {"explanation": "...", "patch": {"ops": [...]} or null}.',
        'When the fix is a change to the flow that you are sure of — a prompt that should ask for something else, a schema field that should be optional, a ceiling that should be higher — put it in "patch" using the operations addNode, updateNode (whole config), removeNode, addEdge, removeEdge, setMeta on the flow\'s own ids. When the fix is outside the flow (a file with no text, a model that is not set up, a ceiling reached), "patch" is null and the explanation says what to do instead.',
        languageRule(locale),
        DATA_RULE,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `The flow:\n${fenceUntrusted(JSON.stringify(doc), 40_000)}`,
        `The brick that failed: ${failed.nodeId} (${node?.title ?? "?"}, ${node?.type ?? "?"})${failed.iteration ? `, round ${failed.iteration + 1}` : ""}`,
        `What it had in hand:\n${fenceUntrusted(JSON.stringify(failed.input ?? {}), 6000)}`,
        `The error: ${fenceUntrusted(runError, 2000)}`,
        'Answer with {"explanation": "...", "patch": ... or null}.',
      ].join("\n\n"),
    },
  ];
}

export type Explanation =
  | { ok: true; explanation: string; patch: Patch | null; warnings: Problem[] }
  | { ok: false; reason: "badAnswer"; problems: string[] };

/** The patch is judged against the flow as it is now, not the version that ran. */
export async function explainFailure(
  current: FlowDocument,
  ran: FlowDocument,
  failed: FailedStep,
  runError: string,
  locale: string,
  ask: Ask,
): Promise<Explanation> {
  const answer = await ask(explainMessages(ran, failed, runError, locale), { maxTokens: 2500 });
  const record =
    typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>) : {};
  const explanation =
    typeof record.explanation === "string" ? record.explanation.trim().slice(0, 2000) : "";
  if (!explanation) return { ok: false, reason: "badAnswer", problems: ["no explanation"] };
  if (record.patch === null || record.patch === undefined)
    return { ok: true, explanation, patch: null, warnings: [] };
  const parsed = Patch.safeParse(record.patch);
  const applied = parsed.success ? applyPatch(current, parsed.data) : null;
  // A fix that does not apply is not offered; the explanation still is.
  if (!parsed.success || !applied?.ok) return { ok: true, explanation, patch: null, warnings: [] };
  return { ok: true, explanation, patch: parsed.data, warnings: applied.warnings };
}
