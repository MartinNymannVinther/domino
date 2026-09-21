import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractText, mimeFor } from "@/modules/files/extract";

/**
 * The text out of a file, once, at upload: a PDF, a Word file and plain
 * text give their words; an image gives its reason. The two samples are
 * the smallest valid files of their kind, written by hand, so the test
 * is about the extractors and not about somebody's document.
 */
describe("extractText", () => {
  it("reads a PDF", async () => {
    const result = await extractText("application/pdf", readFileSync("tests/files/sample.pdf"));
    expect(result).toMatchObject({ text: expect.stringContaining("Anna Hansen") });
  });

  it("reads a Word file", async () => {
    const result = await extractText(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      readFileSync("tests/files/sample.docx"),
    );
    expect(result).toMatchObject({ text: expect.stringContaining("Aalborg Kommune") });
  });

  it("reads plain text and refuses what it cannot read", async () => {
    expect(await extractText("text/plain", Buffer.from("  hej\r\nverden  "))).toEqual({
      text: "hej\nverden",
    });
    expect(await extractText("text/plain", Buffer.from("   "))).toEqual({ error: "empty" });
    expect(await extractText("image/png", Buffer.from([1, 2, 3]))).toEqual({
      error: "unsupported",
    });
    expect(await extractText("application/pdf", Buffer.from("not a pdf"))).toEqual({
      error: "failed",
    });
  });

  it("names the type from the extension when the browser did not", () => {
    expect(mimeFor("a.pdf", "")).toBe("application/pdf");
    expect(mimeFor("a.docx", "application/octet-stream")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(mimeFor("a.md", "")).toBe("text/markdown");
    expect(mimeFor("a.exe", "")).toBe("application/octet-stream");
  });
});
