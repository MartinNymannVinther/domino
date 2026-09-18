import type { LlmMessage } from "@/core/llm";
import { applyPatch, Patch, type FlowDocument, type Problem } from "@/modules/flow";
import { FLOW_FORMAT_RULES } from "./flow-format-prompt";
import { DATA_RULE, fenceUntrusted, languageRule } from "./prompting";
import type { Ask } from "./propose-flow";
import { MAX_MESSAGE_CHARS } from "./wire";

export { MAX_MESSAGE_CHARS };

/**
 * The conversation after the first draft (CLAUDE.md, product
 * principles): "add a check for whether the applicant is entitled",
 * "make the summary shorter". The model answers with a reply and a
 * patch in the document's own vocabulary (docs/adr/0011), or a reply
 * alone when the person asked a question. The patch is applied to the
 * document it was written for and validated whole before anybody sees
 * it; it becomes a version only when the person accepts.
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChangeProposal =
  | { ok: true; reply: string; patch: Patch | null; warnings: Problem[] }
  | { ok: false; reason: "badAnswer"; problems: string[] };

const HISTORY_TURNS = 8;

function system(locale: string): string {
  return [
    'You help a person shape a workflow in Domino, a visual flow builder for people who do not program. You see the flow as it is now and the conversation so far. Answer with one JSON object: {"reply": "...", "patch": {"ops": [...]} or null}.',
    '"reply" is one to three sentences to the person: what you changed and why, or the answer to their question. When the request is a change, "patch" holds it; when it is a question or nothing should change, "patch" is null.',
    languageRule(locale),
    DATA_RULE,
    "A patch is a list of operations on the flow, applied in order:",
    '{ "op": "addNode", "node": { "id", "type", "title", "config" } } — a new brick, with a new id.',
    '{ "op": "updateNode", "id": "n4", "title": "...", "config": { ... } } — replaces the title and/or the whole config; the type cannot change.',
    '{ "op": "removeNode", "id": "n5" } — removes the brick and every edge touching it.',
    '{ "op": "addEdge", "edge": { "id", "from": { "node", "port" }, "to": { "node", "port" } } } — a new connection, with a new id.',
    '{ "op": "removeEdge", "id": "e3" }',
    '{ "op": "setMeta", "name": "...", "description": "..." }',
    "Change as little as the request needs. Keep existing ids. When you change a prompt's references, add or remove the matching edges. When you insert a brick between two others, remove the old edge and add the two new ones. The result must still hold together: every input connected, kinds fitting, loops paired.",
    "",
    FLOW_FORMAT_RULES,
  ].join("\n");
}

export function changeMessages(
  doc: FlowDocument,
  history: ChatTurn[],
  message: string,
  locale: string,
): LlmMessage[] {
  const recent = history.slice(-HISTORY_TURNS);
  return [
    { role: "system", content: system(locale) },
    {
      role: "user",
      content: `The flow as it is now:\n${fenceUntrusted(JSON.stringify(doc), 60_000)}`,
    },
    ...recent.map((turn) => ({
      role: turn.role,
      content:
        turn.role === "user"
          ? fenceUntrusted(turn.content, MAX_MESSAGE_CHARS)
          : turn.content.slice(0, MAX_MESSAGE_CHARS),
    })),
    {
      role: "user",
      content: `${fenceUntrusted(message, MAX_MESSAGE_CHARS)}\n\nAnswer with {"reply": "...", "patch": ... or null}.`,
    },
  ];
}

/** Reads the model's JSON as a reply and a patch that applies, or says what is wrong. */
export function readProposedChange(
  doc: FlowDocument,
  answer: unknown,
):
  | { ok: true; reply: string; patch: Patch | null; warnings: Problem[] }
  | { ok: false; problems: string[] } {
  const record =
    typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>) : {};
  const reply = typeof record.reply === "string" ? record.reply.trim().slice(0, 1200) : "";
  if (record.patch === null || record.patch === undefined) {
    return reply
      ? { ok: true, reply, patch: null, warnings: [] }
      : { ok: false, problems: ["no reply"] };
  }
  const parsed = Patch.safeParse(record.patch);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const applied = applyPatch(doc, parsed.data);
  if (!applied.ok) {
    return {
      ok: false,
      problems: applied.problems
        .slice(0, 8)
        .map((p) => (applied.at >= 0 ? `op ${applied.at}: ${p.message}` : p.message)),
    };
  }
  return { ok: true, reply, patch: parsed.data, warnings: applied.warnings };
}

export async function proposeChange(
  doc: FlowDocument,
  history: ChatTurn[],
  message: string,
  locale: string,
  ask: Ask,
): Promise<ChangeProposal> {
  const messages = changeMessages(doc, history, message, locale);
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const asked =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user" as const,
              content: `Your patch could not be applied: ${problems.join("; ")}. Answer again with the whole corrected {"reply", "patch"}.`,
            },
          ];
    const answer = await ask(asked, { maxTokens: 3000 });
    const read = readProposedChange(doc, answer);
    if (read.ok) return read;
    problems = read.problems;
  }
  return { ok: false, reason: "badAnswer", problems };
}
