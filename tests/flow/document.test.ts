import { describe, expect, it } from "vitest";
import {
  EXAMPLE_FLOWS,
  FlowNode,
  parseDocument,
  PortIndex,
  validateDocument,
  type FlowDocument,
} from "@/modules/flow";

/**
 * The document holds together or it does not, and validation says which
 * brick (docs/flow-format.md). Every rule gets one document that breaks
 * it, and the examples prove the rules let a real flow through.
 */

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;

function withEdits(doc: FlowDocument, edit: (d: FlowDocument) => void): FlowDocument {
  const copy = structuredClone(doc);
  edit(copy);
  return copy;
}

/** Every problem, warnings included: a stored document may still have things to say. */
const codes = (doc: unknown) => {
  const result = parseDocument(doc);
  return result.ok ? result.warnings.map((p) => p.code) : result.problems.map((p) => p.code);
};

describe("the example flows", () => {
  it.each(EXAMPLE_FLOWS.map((e) => [e.key, e.document] as const))("%s validates", (_, doc) => {
    expect(validateDocument(doc)).toEqual([]);
  });

  it("know the columns of a table output", () => {
    const applications = EXAMPLE_FLOWS.find((e) => e.key === "applications")!.document;
    expect(new PortIndex(applications).tableColumns("n6")).toEqual([
      "navn",
      "uddannelse",
      "erfaring",
      "motivation",
      "vurdering",
    ]);
  });
});

describe("the shape", () => {
  it("refuses what is not a flow", () => {
    expect(codes({ format: "something.else", version: 1 })).toContain("shape");
    expect(codes({ ...summary, nodes: [] })).toEqual(["shape"]);
  });

  it("refuses a config that does not fit its type", () => {
    const doc = withEdits(summary, (d) => {
      d.nodes[2]!.config = { prompt: "" } as never;
    });
    expect(codes(doc)).toEqual(["shape"]);
  });

  it("refuses an id that does not look like one", () => {
    const doc = withEdits(summary, (d) => {
      d.nodes[0]!.id = "Node-1";
    });
    expect(codes(doc)).toEqual(["shape"]);
  });

  it("refuses a structured schema outside the subset", () => {
    const doc = withEdits(summary, (d) => {
      // Not parsed: a schema outside the subset is exactly what the
      // document is supposed to be refused for.
      d.nodes[2] = {
        id: "n3",
        type: "structured",
        title: "x",
        config: {
          prompt: "{{n2.text}}",
          schema: { type: "object", properties: { a: { type: "null" } } },
          temperature: 0,
          maxTokens: 100,
        },
      } as never;
    });
    expect(codes(doc)).toEqual(["shape"]);
  });
});

describe("the rules", () => {
  it("refuses a duplicate id", () => {
    const doc = withEdits(summary, (d) => {
      d.edges[0]!.id = "n1";
    });
    expect(codes(doc)).toEqual(["duplicateId"]);
  });

  it("refuses an edge to a brick that does not exist", () => {
    const doc = withEdits(summary, (d) => {
      d.edges[0]!.to.node = "n9";
    });
    expect(codes(doc)).toContain("unknownNode");
  });

  it("refuses an edge to a port that does not exist", () => {
    const doc = withEdits(summary, (d) => {
      d.edges[0]!.to.port = "nothing";
    });
    expect(codes(doc)).toContain("unknownPort");
  });

  it("refuses two edges into one port", () => {
    const doc = withEdits(summary, (d) => {
      d.edges.push({
        id: "e9",
        from: { node: "n3", port: "text" },
        to: { node: "n4", port: "value" },
      });
    });
    expect(codes(doc)).toContain("portTaken");
  });

  it("refuses a reference port fed from the wrong brick", () => {
    const doc = withEdits(summary, (d) => {
      d.edges[1]!.from = { node: "n1", port: "value" };
    });
    expect(codes(doc)).toContain("referenceMismatch");
  });

  it("refuses kinds that do not fit", () => {
    const doc = withEdits(summary, (d) => {
      // The input's file straight into the output's text.
      d.edges[2]!.from = { node: "n1", port: "value" };
      d.edges.splice(0, 2);
      d.nodes.splice(1, 2);
    });
    expect(codes(doc)).toContain("kindMismatch");
  });

  it("warns about an unconnected input, but lets the document be kept", () => {
    const doc = withEdits(summary, (d) => {
      d.edges.splice(1, 1);
    });
    expect(codes(doc)).toContain("unconnected");
    expect(parseDocument(doc).ok).toBe(true);
  });

  it("warns about a flow without an output", () => {
    const doc = withEdits(summary, (d) => {
      d.nodes.pop();
      d.edges.pop();
    });
    expect(codes(doc)).toContain("noOutput");
    expect(parseDocument(doc).ok).toBe(true);
  });

  it("refuses a circle", () => {
    const doc = withEdits(summary, (d) => {
      d.nodes[2] = FlowNode.parse({
        ...d.nodes[2]!,
        config: { prompt: "{{n2.text}} {{n3.text}}", temperature: 0, maxTokens: 10 },
      }) as never;
      d.edges.push({
        id: "e9",
        from: { node: "n3", port: "text" },
        to: { node: "n3", port: "n3.text" },
      });
    });
    expect(codes(doc)).toContain("cycle");
  });

  it("refuses a field read off a text port", () => {
    const doc = withEdits(summary, (d) => {
      d.nodes[2] = FlowNode.parse({
        ...d.nodes[2]!,
        config: { prompt: "{{n2.text.name}}", temperature: 0, maxTokens: 10 },
      }) as never;
    });
    expect(codes(doc)).toContain("fieldOnText");
  });
});

describe("loops", () => {
  const applications = EXAMPLE_FLOWS.find((e) => e.key === "applications")!.document;

  it("refuse a start without an end", () => {
    const doc = withEdits(applications, (d) => {
      (d.nodes[4] as { config: { loopId: string } }).config.loopId = "l2";
    });
    expect(codes(doc)).toContain("loopUnpaired");
  });

  it("refuse a brick inside the loop that never comes back", () => {
    const doc = withEdits(applications, (d) => {
      d.nodes.push(
        FlowNode.parse({
          id: "n7",
          type: "llm",
          title: "Sidespor",
          config: { prompt: "{{n3.text}}", temperature: 0, maxTokens: 10 },
        }),
      );
      d.nodes.push(
        FlowNode.parse({
          id: "n8",
          type: "output",
          title: "Ud",
          config: { kind: "text", label: "Ud" },
        }),
      );
      d.edges.push({
        id: "e8",
        from: { node: "n3", port: "text" },
        to: { node: "n7", port: "n3.text" },
      });
      d.edges.push({
        id: "e9",
        from: { node: "n7", port: "text" },
        to: { node: "n8", port: "value" },
      });
    });
    const found = codes(doc);
    expect(found).toContain("loopEscapes");
    expect(found).toContain("loopHoldsEnd");
  });

  it("refuse a loop inside a loop", () => {
    // An inner pair whose end feeds the outer end, so the outer start reaches it.
    const inner = withEdits(applications, (d) => {
      d.nodes.push(
        FlowNode.parse({ id: "n7", type: "loop_start", title: "Indre", config: { loopId: "l2" } }),
      );
      d.nodes.push(
        FlowNode.parse({
          id: "n8",
          type: "loop_end",
          title: "Indre slut",
          config: { loopId: "l2" },
        }),
      );
      d.nodes.push(
        FlowNode.parse({
          id: "n9",
          type: "combine",
          title: "Liste af én",
          config: { mode: "list", separator: "" },
        }),
      );
      d.edges.push({ id: "e8", from: { node: "n3", port: "text" }, to: { node: "n9", port: "a" } });
      d.edges.push({ id: "e9", from: { node: "n3", port: "text" }, to: { node: "n9", port: "b" } });
      d.edges.push({
        id: "e10",
        from: { node: "n9", port: "list" },
        to: { node: "n7", port: "items" },
      });
      d.edges.push({
        id: "e11",
        from: { node: "n7", port: "item" },
        to: { node: "n8", port: "item" },
      });
      d.edges[3] = {
        id: "e4",
        from: { node: "n8", port: "items" },
        to: { node: "n5", port: "item" },
      };
    });
    expect(codes(inner)).toContain("loopNested");
  });
});
