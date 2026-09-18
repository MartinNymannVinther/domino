import type { JsonObject, Value } from "./types";

/**
 * Reading values the way bricks do: as text for a prompt, as a field
 * off an object, as a number for a comparison. Lenient on purpose — a
 * brick that is handed a list where it wanted text gets the list
 * written out, not a failure — because the person watching a run wants
 * to see what came through, and validation already refused the edges
 * that could not fit.
 */

export function isFileRef(value: Value): value is { fileId: string; name: string; mime: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { fileId?: unknown }).fileId === "string"
  );
}

export function isObject(value: Value): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isFileRef(value);
}

export function toText(value: Value | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isFileRef(value)) return value.name;
  if (Array.isArray(value)) return value.map(toText).join("\n");
  return JSON.stringify(value, null, 2);
}

/** `{{n3.json.name}}`: the value on the port, then each path segment on the way in. */
export function readPath(value: Value | undefined, path: string[]): Value | undefined {
  let current: Value | undefined = value;
  for (const segment of path) {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current)) {
      const i = Number(segment);
      current = Number.isInteger(i) ? current[i] : undefined;
    } else if (isObject(current)) {
      current = (current as JsonObject)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

export function toNumber(value: Value | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Danish decimals: "1.250,50" is 1250.5.
    const normalised = value
      .trim()
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const n = Number(normalised);
    return Number.isFinite(n) && normalised !== "" ? n : null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

export function isEmpty(value: Value | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}
