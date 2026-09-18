import { describe, expect, it } from "vitest";
import { toGraph } from "@/components/canvas/graph";
import { newBrickOps } from "@/components/flow/brick-defaults";
import {
  candidateSources,
  connectionAllowed,
  connectOps,
  removeOps,
  updateConfigOps,
} from "@/components/flow/patches";
import { applyPatch, EXAMPLE_FLOWS, validateDocument } from "@/modules/flow";

/**
 * The canvas's gestures as patches, and the document as a graph: pure
 * functions with no browser, so they are proven here. What is drawn is
 * exactly what is in the document, and every gesture leaves a document
 * that applies.
 */

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;
const applications = EXAMPLE_FLOWS.find((e) => e.key === "applications")!.document;

describe("toGraph", () => {
  it("draws one node per brick and one edge per connection, laid out left to right", () => {
    const { nodes, edges } = toGraph(summary, validateDocument(summary));
    expect(nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3", "n4"]);
    expect(edges.map((e) => `${e.source}:${e.sourceHandle}>${e.target}:${e.targetHandle}`)).toEqual(
      ["n1:value>n2:file", "n2:text>n3:n2.text", "n3:text>n4:value"],
    );
    const x = nodes.map((n) => n.position.x);
    expect(x[0]).toBeLessThan(x[1]!);
    expect(x[1]).toBeLessThan(x[2]!);
    expect(x[2]).toBeLessThan(x[3]!);
    expect(nodes.every((n) => n.draggable === false)).toBe(true);
  });

  it("hands a brick its ports, kinds and problems", () => {
    const loose = { ...summary, edges: summary.edges.slice(0, 2) };
    const { nodes } = toGraph(loose, validateDocument(loose));
    const output = nodes.find((n) => n.id === "n4")!.data;
    expect(output.inputs).toEqual([
      { name: "value", kind: { kind: "text" }, required: true, connected: false },
    ]);
    expect(output.problems.map((p) => p.code)).toEqual(["unconnected"]);
    const llm = nodes.find((n) => n.id === "n3")!.data;
    expect(llm.inputs.map((p) => p.name)).toEqual(["n2.text"]);
    expect(llm.outputs).toEqual([{ name: "text", kind: { kind: "text" } }]);
  });
});

describe("connecting", () => {
  it("adds an edge between fitting ports and refuses one that is taken", () => {
    const loose = { ...summary, edges: summary.edges.slice(0, 2) };
    const ops = connectOps(loose, {
      source: "n3",
      sourceHandle: "text",
      target: "n4",
      targetHandle: "value",
    });
    expect(ops).toEqual([
      {
        op: "addEdge",
        edge: { id: "e3", from: { node: "n3", port: "text" }, to: { node: "n4", port: "value" } },
      },
    ]);
    expect(
      connectionAllowed(summary, {
        source: "n3",
        sourceHandle: "text",
        target: "n4",
        targetHandle: "value",
      }),
    ).toBe(false);
    expect(
      connectionAllowed(loose, {
        source: "n1",
        sourceHandle: "value",
        target: "n4",
        targetHandle: "value",
      }),
    ).toBe(false);
  });

  it("writes a reference into a prompt when dropped on its + handle", () => {
    const ops = connectOps(summary, {
      source: "n1",
      sourceHandle: "value",
      target: "n3",
      targetHandle: "__ref",
    })!;
    expect(ops.map((o) => o.op)).toEqual(["updateNode", "addEdge"]);
    const result = applyPatch(summary, { ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const llm = result.document.nodes.find((n) => n.id === "n3")!;
    expect((llm.config as { prompt: string }).prompt.endsWith("{{n1.value}}")).toBe(true);
    expect(result.document.edges.some((e) => e.to.port === "n1.value")).toBe(true);
  });
});

describe("the panel", () => {
  it("changes a prompt and the edges it implies in one patch", () => {
    const ops = updateConfigOps(summary, "n3", {
      prompt: "Kun titlen: {{n1.value}}",
      temperature: 0,
      maxTokens: 100,
    });
    expect(ops.map((o) => o.op)).toEqual(["updateNode", "removeEdge", "addEdge"]);
    expect(applyPatch(summary, { ops }).ok).toBe(true);
  });

  it("offers only the sources that fit a port", () => {
    expect(candidateSources(summary, "n2", "file").map((c) => `${c.node}.${c.port}`)).toEqual([
      "n1.value",
    ]);
    expect(candidateSources(summary, "n4", "value").map((c) => `${c.node}.${c.port}`)).toEqual([
      "n2.text",
      "n3.text",
    ]);
  });

  it("removes a brick, and only the edges not already taken by it", () => {
    expect(removeOps(summary, { nodes: ["n3"], edges: ["e2", "e1"] })).toEqual([
      { op: "removeNode", id: "n3" },
      { op: "removeEdge", id: "e1" },
    ]);
  });
});

describe("adding a brick", () => {
  const titles = { title: "Ny", endTitle: "Saml" };

  it("after a brick, connects it where the kinds fit", () => {
    const ops = newBrickOps(summary, "llm", titles, "n2");
    const result = applyPatch(summary, { ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const added = result.document.nodes.at(-1)!;
    expect(added.type).toBe("llm");
    expect((added.config as { prompt: string }).prompt).toBe("{{n2.text}}");
    expect(result.document.edges.at(-1)).toMatchObject({ to: { node: added.id, port: "n2.text" } });

    const output = applyPatch(summary, { ops: newBrickOps(summary, "output", titles, "n3") });
    expect(output.ok && output.document.edges.at(-1)).toMatchObject({
      from: { node: "n3", port: "text" },
    });
  });

  it("leaves a brick loose when nothing fits, with the warning to say so", () => {
    const ops = newBrickOps(summary, "document", titles, "n3");
    const result = applyPatch(summary, { ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.edges).toHaveLength(3);
    expect(result.warnings.map((p) => p.code)).toEqual(["unconnected"]);
  });

  it("adds a loop as its pair with a fresh loop id", () => {
    const ops = newBrickOps(applications, "loop_start", titles, null);
    expect(ops.map((o) => o.op)).toEqual(["addNode", "addNode"]);
    const ids = ops.map((o) => (o.op === "addNode" ? o.node.config : null));
    expect(ids[0]).toEqual({ loopId: "l2" });
    expect(ids[1]).toEqual({ loopId: "l2" });
    expect(applyPatch(applications, { ops }).ok).toBe(true);
  });
});
