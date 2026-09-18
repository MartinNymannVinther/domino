import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/components/ui/markdown";

/**
 * The little Markdown a model writes, read into blocks. What is not in
 * the subset stays text; nothing ever becomes HTML.
 */
describe("parseMarkdown", () => {
  it("reads headings, paragraphs, lists, rules and code", () => {
    const blocks = parseMarkdown(
      [
        "**Dataenes kvalitet**",
        "Dataene indeholder fejl:",
        "- Datoformater er inkonsekvente",
        "- Manglende værdier",
        "  i flere kolonner",
        "",
        "---",
        "",
        "## Indsigter",
        "1. Dominans af *Task*",
        "2. Fokus på automation",
        "",
        "```",
        "SELECT 1",
        "```",
        "<script>alert(1)</script>",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { kind: "heading", level: 3, text: "Dataenes kvalitet" },
      { kind: "paragraph", text: "Dataene indeholder fejl:" },
      {
        kind: "list",
        ordered: false,
        items: ["Datoformater er inkonsekvente", "Manglende værdier i flere kolonner"],
      },
      { kind: "rule" },
      { kind: "heading", level: 2, text: "Indsigter" },
      { kind: "list", ordered: true, items: ["Dominans af *Task*", "Fokus på automation"] },
      { kind: "code", text: "SELECT 1" },
      { kind: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
});
