import type { LlmMessage } from "@/core/llm";
import { importRaw, validateDocument, type FlowDocument, type Problem } from "@/modules/flow";
import { exampleFlowJson, FLOW_FORMAT_RULES } from "./flow-format-prompt";
import { DATA_RULE, fenceUntrusted, languageRule } from "./prompting";
import { MAX_DESCRIPTION_CHARS } from "./wire";

export { MAX_DESCRIPTION_CHARS };

/**
 * Talking a flow into existence (CLAUDE.md, product principles): a
 * description in the person's words becomes a whole document — bricks,
 * connections, prompts, schemas — that lands on the canvas ready to be
 * edited. The model's answer is read as a file would be: migrated,
 * given the edges its prompts imply, validated whole. What does not
 * hold together goes back once with the problems named; a second miss
 * is a refusal, never a broken flow on the canvas.
 *
 * The model is asked through `ask`, handed in, so this is proven with
 * a fake and wired to the workspace's provider by the route.
 */

export type Ask = (messages: LlmMessage[], options: { maxTokens: number }) => Promise<unknown>;

export type FlowProposal =
  | { ok: true; document: FlowDocument; warnings: Problem[]; note: string }
  | { ok: false; reason: "badAnswer"; problems: string[] };

function system(locale: string): string {
  return [
    'You design workflows for Domino, a visual flow builder for people who do not program. A person describes what they want; you answer with one complete flow in Domino\'s format, and nothing else: one JSON object with the keys "note" and "flow".',
    '"note" is one or two sentences to the person about what the flow does and what they may want to adjust. "flow" is the document.',
    languageRule(locale),
    DATA_RULE,
    "Keep it simple: the fewest bricks that do the job, usually three to seven. A pile of documents means input(list of files) → loop_start → document → structured or llm → loop_end → output(table or text). One document means input(file) → document → llm → output(text). Text pasted in means input(text) → ... Ask for structure (a structured brick with a schema) whenever the person wants points, fields, a table or a comparison.",
    "",
    FLOW_FORMAT_RULES,
    "",
    "A complete example of a flow document:",
    exampleFlowJson("applications"),
  ].join("\n");
}

export function proposalMessages(description: string, locale: string): LlmMessage[] {
  return [
    { role: "system", content: system(locale) },
    {
      role: "user",
      content: `The person describes what they want:\n${fenceUntrusted(description, MAX_DESCRIPTION_CHARS)}\n\nAnswer with {"note": "...", "flow": { ... }}.`,
    },
  ];
}

/** Reads the model's JSON as a document, or says what is wrong with it. */
export function readProposedFlow(
  answer: unknown,
):
  | { ok: true; document: FlowDocument; warnings: Problem[]; note: string }
  | { ok: false; problems: string[] } {
  const record =
    typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>) : {};
  const raw = "flow" in record ? record.flow : record;
  const note = typeof record.note === "string" ? record.note.trim().slice(0, 600) : "";
  const imported = importRaw(raw);
  if (!imported.ok) {
    const problems = imported.problems?.map((p) => p.message) ?? [
      `the answer was not a flow (${imported.reason})`,
    ];
    return { ok: false, problems: problems.slice(0, 12) };
  }
  return {
    ok: true,
    document: imported.document,
    warnings: validateDocument(imported.document),
    note,
  };
}

export async function proposeFlow(
  description: string,
  locale: string,
  ask: Ask,
): Promise<FlowProposal> {
  const messages = proposalMessages(description, locale);
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const asked =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user" as const,
              content: `Your flow did not hold together: ${problems.join("; ")}. Answer again with the whole corrected {"note", "flow"}.`,
            },
          ];
    const answer = await ask(asked, { maxTokens: 4000 });
    const read = readProposedFlow(answer);
    if (read.ok) return read;
    problems = read.problems;
  }
  return { ok: false, reason: "badAnswer", problems };
}
