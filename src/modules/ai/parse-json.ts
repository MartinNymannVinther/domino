/**
 * What a model wrote, as JSON. Models wrap the object in a code fence, add
 * a sentence before it, or both; this strips what it can and parses what
 * is left. Null when nothing parsable remains — the caller decides what
 * that means, which in this product is always the same thing: the
 * surface says the model did not answer and writes nothing (ADR 0009).
 */
export function parseModelJson(content: string): unknown | null {
  const cleaned = content
    .replace(/^[^{[]*```(?:json)?\s*/i, "")
    .replace(/```[\s\S]*$/i, "")
    .trim();
  const candidates = [cleaned];
  // A sentence before the object: keep from the first brace.
  const brace = cleaned.indexOf("{");
  if (brace > 0) candidates.push(cleaned.slice(brace));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return null;
}
