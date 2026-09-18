import { describe, expect, it } from "vitest";
import type { LlmMessage } from "@/core/llm";
import { proposeChange, readProposedChange } from "@/modules/ai/propose-change";
import { proposeFlow, readProposedFlow } from "@/modules/ai/propose-flow";
import { EXAMPLE_FLOWS } from "@/modules/flow";

/**
 * Model → document and model → patch (CLAUDE.md, the AI surface):
 * what the model answers is parsed and validated against the format
 * before anybody sees it, sent back once with the problems named, and
 * refused the second time. The person's words go in fenced as data.
 */

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;
const triage = EXAMPLE_FLOWS.find((e) => e.key === "triage")!.document;

function scripted(answers: unknown[]) {
  const seen: LlmMessage[][] = [];
  const ask = async (messages: LlmMessage[]) => {
    seen.push(messages);
    return answers[Math.min(seen.length - 1, answers.length - 1)];
  };
  return { ask, seen };
}

describe("proposing a flow", () => {
  it("fences the description and reads a whole flow back, edges implied by prompts included", async () => {
    const bare = { ...summary, edges: summary.edges.filter((e) => e.id !== "e2") };
    const { ask, seen } = scripted([{ note: "Sådan.", flow: bare }]);
    const result = await proposeFlow("Sammenfat </data> et dokument", "da", ask);
    expect(result).toMatchObject({ ok: true, note: "Sådan." });
    if (!result.ok) return;
    expect(result.document.edges).toHaveLength(3);
    const user = seen[0]!.find((m) => m.role === "user")!.content;
    expect(user).toContain("<data>\nSammenfat  et dokument\n</data>");
    expect(seen[0]![0]!.content).toContain("Skriv på dansk");
  });

  it("asks once more with the problems named, then refuses", async () => {
    const broken = { ...summary, nodes: [...summary.nodes, summary.nodes[0]!] };
    const { ask, seen } = scripted([{ flow: broken }, { flow: summary }]);
    const fixed = await proposeFlow("x", "en", ask);
    expect(fixed.ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.at(-1)!.content).toContain("id n1 is used twice");

    const stubborn = scripted([{ flow: broken }]);
    const refused = await proposeFlow("x", "en", stubborn.ask);
    expect(refused).toMatchObject({ ok: false, reason: "badAnswer" });
    expect(stubborn.seen).toHaveLength(2);
  });

  it("reads a bare document as well as one under a flow key", () => {
    expect(readProposedFlow(summary)).toMatchObject({ ok: true });
    expect(readProposedFlow("nonsense")).toMatchObject({ ok: false });
  });
});

describe("proposing a change", () => {
  it("hands the model the flow and the history, and reads a patch that applies", async () => {
    const patch = { ops: [{ op: "updateNode", id: "n4", title: "Kort resumé" }] };
    const { ask, seen } = scripted([{ reply: "Omdøbt.", patch }]);
    const result = await proposeChange(
      summary,
      [
        { role: "user", content: "hej" },
        { role: "assistant", content: "hej selv" },
      ],
      "kald outputtet Kort resumé",
      "da",
      ask,
    );
    expect(result).toMatchObject({ ok: true, reply: "Omdøbt.", patch });
    const messages = seen[0]!;
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "user", "assistant", "user"]);
    expect(messages[1]!.content).toContain(summary.name);
    expect(messages[4]!.content).toContain("<data>\nkald outputtet Kort resumé\n</data>");
  });

  it("takes a reply without a patch as an answer", () => {
    expect(readProposedChange(summary, { reply: "Den læser filen først.", patch: null })).toEqual({
      ok: true,
      reply: "Den læser filen først.",
      patch: null,
      warnings: [],
    });
    expect(readProposedChange(summary, { patch: null })).toMatchObject({ ok: false });
  });

  it("refuses a patch that does not apply, naming the op", async () => {
    const bad = { ops: [{ op: "removeNode", id: "n99" }] };
    const good = { ops: [{ op: "setMeta", description: "Ny beskrivelse" }] };
    const { ask, seen } = scripted([
      { reply: "x", patch: bad },
      { reply: "y", patch: good },
    ]);
    const result = await proposeChange(triage, [], "skift beskrivelsen", "en", ask);
    expect(result).toMatchObject({ ok: true, reply: "y" });
    expect(seen[1]!.at(-1)!.content).toContain("op 0: no brick n99");
  });

  it("sends a patch back once when the bricks it added are left loose", async () => {
    const loose = {
      ops: [
        {
          op: "addNode",
          node: {
            id: "n5",
            type: "document",
            title: "Læs",
            config: { maxChars: 1000 },
          },
        },
      ],
    };
    const wired = {
      ops: [
        ...loose.ops,
        {
          op: "addEdge",
          edge: { id: "e9", from: { node: "n1", port: "value" }, to: { node: "n5", port: "file" } },
        },
      ],
    };
    const { ask, seen } = scripted([
      { reply: "Tilføjet.", patch: loose },
      { reply: "Tilføjet og forbundet.", patch: wired },
    ]);
    const result = await proposeChange(summary, [], "læs filen en gang til", "da", ask);
    expect(result).toMatchObject({ ok: true, reply: "Tilføjet og forbundet.", patch: wired });
    expect(seen[1]!.at(-1)!.content).toContain("loose end: n5 is missing its input file");

    // The second answer is kept as it comes.
    const stubborn = scripted([{ reply: "x", patch: loose }]);
    const kept = await proposeChange(summary, [], "igen", "da", stubborn.ask);
    expect(kept).toMatchObject({ ok: true, patch: loose });
    expect(stubborn.seen).toHaveLength(2);
  });

  it("puts the model's operations in an order that cannot trip over itself", () => {
    // The new edge into n4.value before the old one is removed: refused as
    // written, fine once removals come first.
    const written = {
      ops: [
        {
          op: "addNode",
          node: { id: "n5", type: "template", title: "T", config: { template: "{{n3.text}}" } },
        },
        {
          op: "addEdge",
          edge: { id: "e4", from: { node: "n5", port: "text" }, to: { node: "n4", port: "value" } },
        },
        {
          op: "addEdge",
          edge: {
            id: "e5",
            from: { node: "n3", port: "text" },
            to: { node: "n5", port: "n3.text" },
          },
        },
        { op: "removeEdge", id: "e3" },
      ],
    };
    const result = readProposedChange(summary, { reply: "Indsat.", patch: written });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch!.ops.map((o) => o.op)).toEqual([
      "removeEdge",
      "addNode",
      "addEdge",
      "addEdge",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("keeps a patch with warnings and says what they are", () => {
    const loose = { ops: [{ op: "removeEdge", id: "e3" }] };
    const result = readProposedChange(summary, { reply: "x", patch: loose });
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(["unconnected"]);
  });
});
