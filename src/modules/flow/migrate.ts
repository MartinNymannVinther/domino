import { FORMAT, FORMAT_VERSION } from "./schema";

/**
 * Reading a document that was written under an older format version
 * (docs/flow-format.md). Import reads `version`, applies one step at a
 * time until the document is current, and validates the result; a
 * version this installation does not know is refused by name rather
 * than guessed at.
 *
 * There is one version so far, and so no step. The table is here so the
 * first step lands in one place, with its test beside it.
 */
type Step = (doc: Record<string, unknown>) => Record<string, unknown>;

/** From version N to N+1, keyed by N. */
const STEPS: Record<number, Step> = {};

export type MigrateResult =
  | { ok: true; document: unknown; from: number }
  | { ok: false; reason: "notAFlow" | "tooNew" | "unknownVersion"; version?: number };

export function migrateDocument(raw: unknown): MigrateResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, reason: "notAFlow" };
  const doc = { ...(raw as Record<string, unknown>) };
  if (doc.format !== FORMAT) return { ok: false, reason: "notAFlow" };
  const from = doc.version;
  if (typeof from !== "number" || !Number.isInteger(from) || from < 1)
    return { ok: false, reason: "unknownVersion" };
  if (from > FORMAT_VERSION) return { ok: false, reason: "tooNew", version: from };
  let current = doc;
  for (let v = from; v < FORMAT_VERSION; v += 1) {
    const step = STEPS[v];
    if (!step) return { ok: false, reason: "unknownVersion", version: v };
    current = { ...step(current), version: v + 1 };
  }
  return { ok: true, document: current, from };
}
