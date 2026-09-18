/**
 * The text out of a file, once, at upload (docs/adr/0011): PDF, Word
 * and plain text. What comes back is what the document brick reads on
 * every run, so two hundred files are parsed two hundred times in
 * total and never again. A file that yields nothing — a scanned PDF,
 * an image — is kept with the reason; the brick fails on it by name.
 */

export const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);
export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ACCEPTED_MIMES = new Set([...TEXT_MIMES, PDF_MIME, DOCX_MIME]);

/** Extracted text is capped: the document brick cuts further, per flow. */
export const MAX_EXTRACTED_CHARS = 2_000_000;

export type Extraction = { text: string } | { error: string };

export async function extractText(mime: string, bytes: Buffer): Promise<Extraction> {
  try {
    if (TEXT_MIMES.has(mime)) return finish(bytes.toString("utf8"));
    if (mime === PDF_MIME) return finish(await pdfText(bytes));
    if (mime === DOCX_MIME) return finish(await docxText(bytes));
    return { error: "unsupported" };
  } catch (error) {
    console.error("files: extraction failed", mime, error instanceof Error ? error.message : error);
    return { error: "failed" };
  }
}

function finish(text: string): Extraction {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!clean) return { error: "empty" };
  return { text: clean.length > MAX_EXTRACTED_CHARS ? clean.slice(0, MAX_EXTRACTED_CHARS) : clean };
}

async function pdfText(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function docxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}

/** The mime a browser reports, or one read off the name when the browser did not know. */
export function mimeFor(name: string, reported: string): string {
  if (ACCEPTED_MIMES.has(reported)) return reported;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf":
      return PDF_MIME;
    case "docx":
      return DOCX_MIME;
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    default:
      return reported || "application/octet-stream";
  }
}
