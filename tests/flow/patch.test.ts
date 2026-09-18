import { describe, expect, it } from "vitest";
import {
  applyPatch,
  diffDocuments,
  EXAMPLE_FLOWS,
  exportDocument,
  importDocument,
  migrateDocument,
  Patch,
  patchTouches,
  referenceEdgeOps,
  validateRunInput,
  type FlowDocument,
} from "@/modules/flow";

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;
const triage = EXAMPLE_FLOWS.find((e) => e.key === "triage")!.document;

/**
 * A patch is a pure function on the document (docs/adr/0011): it lands
 * whole or not at all, names the operation that failed, and leaves a
 * document that validates. The diff between two documents is a patch in
 * the same words, and applying it gets you there.
 */
describe("applyPatch", () => {
  it("adds a brick and its connection", () => {
    const result = applyPatch(summary, {
      ops: [
        { op: "setMeta", name: "Sammenfat og oversæt" },
        {
          op: "addNode",
          node: {
            id: "n5",
            type: "llm",
            title: "Oversæt",
            config: {
              prompt: "Oversæt til engelsk:\n\n{{n3.text}}",
              temperature: 0,
              maxTokens: 500,
            },
          },
        },
        {
          op: "addEdge",
          edge: {
            id: "e4",
            from: { node: "n3", port: "text" },
            to: { node: "n5", port: "n3.text" },
          },
        },
        { op: "removeEdge", id: "e3" },
        {
          op: "addEdge",
          edge: { id: "e5", from: { node: "n5", port: "text" }, to: { node: "n4", port: "value" } },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.name).toBe("Sammenfat og oversæt");
    expect(result.document.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3", "n4", "n5"]);
    expect(result.document.edges.map((e) => e.id)).toEqual(["e1", "e2", "e4", "e5"]);
    // The original is untouched.
    expect(summary.nodes.length).toBe(4);
  });

  it("refuses a duplicate id and says which op", () => {
    const result = applyPatch(summary, {
      ops: [
        { op: "setMeta", description: "x" },
        {
          op: "addNode",
          node: { id: "n1", type: "output", title: "x", config: { kind: "text", label: "x" } },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, at: 1 });
  });

  it("refuses an update that changes the type or breaks the config", () => {
    const wrongConfig = applyPatch(summary, {
      ops: [{ op: "updateNode", id: "n3", config: { prompt: "" } }],
    });
    expect(wrongConfig).toMatchObject({ ok: false, at: 0 });
    const parsed = Patch.safeParse({ ops: [{ op: "updateNode", id: "n3", type: "output" }] });
    // Type is not a field of the op; zod strips it, so nothing changes.
    expect(parsed.success).toBe(true);
  });

  it("removes a brick together with every edge that touched it", () => {
    const result = applyPatch(summary, {
      ops: [
        { op: "removeNode", id: "n3" },
        {
          op: "addEdge",
          edge: { id: "e9", from: { node: "n2", port: "text" }, to: { node: "n4", port: "value" } },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.edges.map((e) => e.id)).toEqual(["e1", "e9"]);
  });

  it("keeps a patch that leaves a brick unconnected, with the warning beside it", () => {
    const result = applyPatch(summary, { ops: [{ op: "removeEdge", id: "e2" }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings[0]).toMatchObject({ code: "unconnected", nodeId: "n3" });
  });

  it("refuses a patch that leaves a document that is not a flow", () => {
    const result = applyPatch(summary, {
      ops: [
        { op: "removeEdge", id: "e3" },
        {
          op: "addEdge",
          edge: {
            id: "e9",
            from: { node: "n1", port: "value" },
            to: { node: "n4", port: "value" },
          },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, at: -1 });
    if (result.ok) return;
    expect(result.problems.map((p) => p.code)).toContain("kindMismatch");
  });

  it("refuses a second edge into a port", () => {
    const result = applyPatch(summary, {
      ops: [
        {
          op: "addEdge",
          edge: { id: "e9", from: { node: "n1", port: "value" }, to: { node: "n2", port: "file" } },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, at: 0 });
  });

  it("says what a patch touches, for the canvas", () => {
    const touches = patchTouches({
      ops: [
        {
          op: "addNode",
          node: { id: "n9", type: "output", title: "x", config: { kind: "text", label: "x" } },
        },
        { op: "updateNode", id: "n3", title: "y" },
        { op: "removeEdge", id: "e1" },
      ],
    });
    expect([...touches.added]).toEqual(["n9"]);
    expect([...touches.changed]).toEqual(["n3"]);
    expect([...touches.removed]).toEqual(["e1"]);
  });
});

describe("diffDocuments", () => {
  it("is null for the same document", () => {
    expect(diffDocuments(summary, structuredClone(summary))).toBeNull();
  });

  it("produces a patch that takes one document to the other", () => {
    const patch = diffDocuments(summary, triage)!;
    const result = applyPatch(summary, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual(triage);
    // And back again — undo is a diff too.
    const back = applyPatch(result.document, diffDocuments(triage, summary)!);
    expect(back.ok && back.document).toEqual(summary);
  });

  it("re-adds the edges of a brick that changed type", () => {
    const changed: FlowDocument = structuredClone(summary);
    changed.nodes[2] = {
      id: "n3",
      type: "template",
      title: "Uden model",
      config: { template: "Dokumentet:\n{{n2.text}}" },
    };
    const patch = diffDocuments(summary, changed)!;
    expect(patch.ops.map((o) => o.op)).toEqual(["removeNode", "addNode", "addEdge", "addEdge"]);
    const result = applyPatch(summary, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Order is not meaning: the replaced brick lands last, and layout is computed anyway.
    const byId = (d: FlowDocument) => [...d.nodes].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(result.document)).toEqual(byId(changed));
    expect(result.document.edges).toEqual(changed.edges);
  });
});

describe("reference edges", () => {
  it("adds the edge a new reference implies and removes the one a dropped reference leaves", () => {
    const ops = referenceEdgeOps(triage, "n4", "Kun resuméet: {{n2.json.resume}}");
    expect(ops).toEqual([
      { op: "removeEdge", id: "e3" },
      {
        op: "addEdge",
        edge: { id: "e8", from: { node: "n2", port: "json" }, to: { node: "n4", port: "n2.json" } },
      },
    ]);
  });
});

describe("import and export", () => {
  it("round-trips a document", () => {
    const text = exportDocument(summary);
    const result = importDocument(text);
    expect(result.ok && result.document).toEqual(summary);
  });

  it("names what it cannot read", () => {
    expect(importDocument("not json")).toMatchObject({ ok: false, reason: "notJson" });
    expect(importDocument('{"format":"x"}')).toMatchObject({ ok: false, reason: "notAFlow" });
    expect(importDocument(JSON.stringify({ ...summary, version: 99 }))).toMatchObject({
      ok: false,
      reason: "tooNew",
      version: 99,
    });
    expect(importDocument(JSON.stringify({ ...summary, nodes: [] }))).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("writes the edges a hand-written file left out", () => {
    const bare = { ...summary, edges: summary.edges.filter((e) => e.id !== "e2") };
    const result = importDocument(JSON.stringify(bare));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.document.edges.map((e) => `${e.from.node}.${e.from.port}>${e.to.node}.${e.to.port}`),
    ).toEqual(["n1.value>n2.file", "n3.text>n4.value", "n2.text>n3.n2.text"]);
  });

  it("migrates nothing yet and says so", () => {
    expect(migrateDocument(summary)).toMatchObject({ ok: true, from: 1 });
    expect(migrateDocument({ format: "domino.flow", version: 0 })).toMatchObject({
      ok: false,
      reason: "unknownVersion",
    });
  });
});

describe("run input", () => {
  it("takes what the input bricks ask for and nothing else", () => {
    const file = { fileId: "f1", name: "a.pdf", mime: "application/pdf" };
    expect(validateRunInput(summary, { n1: file })).toEqual({ ok: true, input: { n1: file } });
    expect(validateRunInput(summary, { n1: "text" })).toMatchObject({ ok: false });
    expect(validateRunInput(summary, {})).toMatchObject({
      ok: false,
      problems: [{ nodeId: "n1", message: "missing" }],
    });
    expect(validateRunInput(summary, { n1: file, n2: "x" })).toMatchObject({
      ok: false,
      problems: [{ nodeId: "n2", message: "unknown" }],
    });
    expect(validateRunInput(triage, { n1: "Hej" })).toMatchObject({ ok: true });
  });
});
