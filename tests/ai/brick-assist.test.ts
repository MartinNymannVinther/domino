import { describe, expect, it } from "vitest";
import type { LlmMessage } from "@/core/llm";
import { explainFailure, proposePrompt, proposeSchema } from "@/modules/ai/brick-assist";
import { EXAMPLE_FLOWS } from "@/modules/flow";

/**
 * The AI per brick: a prompt that may only name what exists, a schema
 * that must fit the subset, an explanation whose fix is offered only
 * when it applies to the flow as it is now.
 */

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;

function scripted(answers: unknown[]) {
  const seen: LlmMessage[][] = [];
  const ask = async (messages: LlmMessage[]) => {
    seen.push(messages);
    return answers[Math.min(seen.length - 1, answers.length - 1)];
  };
  return { ask, seen };
}

describe("finishing a prompt", () => {
  it("hands the model what the brick can refer to, and takes a prompt that only refers to that", async () => {
    const { ask, seen } = scripted([{ text: "Sammenfat kort:\n\n{{n2.text}}" }]);
    const result = await proposePrompt(summary, "n3", "da", ask);
    expect(result).toEqual({ ok: true, text: "Sammenfat kort:\n\n{{n2.text}}" });
    expect(seen[0]![1]!.content).toContain("{{n2.text}} — Læs dokumentet (document)");
    expect(seen[0]![1]!.content).not.toContain("{{n3.text}}");
  });

  it("refuses a prompt that names a port that does not exist, and a brick with no prompt", async () => {
    const { ask } = scripted([{ text: "{{n9.text}}" }]);
    expect(await proposePrompt(summary, "n3", "da", ask)).toMatchObject({
      ok: false,
      problems: ["unknown reference {{n9.text}}"],
    });
    expect(await proposePrompt(summary, "n1", "da", ask)).toBeNull();
  });
});

describe("a schema from an example", () => {
  it("takes a schema in the subset and sends one outside it back once", async () => {
    const bad = { schema: { type: "object", properties: { a: { type: "date" } } } };
    const good = {
      schema: {
        type: "object",
        properties: { navn: { type: "string", description: "Navnet" } },
        required: ["navn"],
      },
    };
    const { ask, seen } = scripted([bad, good]);
    const result = await proposeSchema("Anna Hansen, 34 år", "navn og alder", "da", ask);
    expect(result).toMatchObject({ ok: true, schema: good.schema });
    expect(seen).toHaveLength(2);
    expect(seen[0]![1]!.content).toContain("<data>\nAnna Hansen, 34 år\n</data>");
  });
});

describe("explaining a failure", () => {
  const failed = {
    nodeId: "n2",
    iteration: 0,
    input: { file: { name: "x.pdf" } },
    error: "no text",
  };

  it("offers the fix only when it applies to the current flow", async () => {
    const applies = { ops: [{ op: "updateNode", id: "n2", config: { maxChars: 1000 } }] };
    const { ask } = scripted([{ explanation: "Filen var tom.", patch: applies }]);
    const result = await explainFailure(summary, summary, failed, "n2: no text", "da", ask);
    expect(result).toMatchObject({ ok: true, explanation: "Filen var tom.", patch: applies });

    const stale = { ops: [{ op: "removeNode", id: "n9" }] };
    const other = scripted([{ explanation: "Noget.", patch: stale }]);
    expect(await explainFailure(summary, summary, failed, "x", "da", other.ask)).toEqual({
      ok: true,
      explanation: "Noget.",
      patch: null,
      warnings: [],
    });
  });

  it("refuses an answer without an explanation", async () => {
    const { ask } = scripted([{ patch: null }]);
    expect(await explainFailure(summary, summary, failed, "x", "en", ask)).toMatchObject({
      ok: false,
    });
  });
});
