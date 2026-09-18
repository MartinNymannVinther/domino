import { ISO_DATE } from "@/core/dates";

/**
 * The small readers every sanitizer is built from. Each one takes a value
 * of unknown shape and gives back something the database can hold, or a
 * fallback: no exceptions, no surprises.
 */

export type Rec = Record<string, unknown>;
export const rec = (v: unknown): Rec => (v ?? {}) as Rec;
export const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);

/** Strips control characters and caps length; text from a model is data. */
export function asString(v: unknown, fallback = "", max = 2000): string {
  if (typeof v !== "string") return fallback;
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export function asIso(v: unknown, fallback: string): string {
  const s = asString(v, "", 10);
  return ISO_DATE.test(s) ? s : fallback;
}

export function asAmount(v: unknown): number | null {
  // Danish number formats in text: "75.000 kr." and "1.250,50" read as whole kroner.
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(v.replace(/,\d+\s*(kr\.?)?$/i, "").replace(/\D/g, ""))
        : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 999_999_999) : null;
}

export function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "ja" || v === "yes") return true;
  if (v === "false" || v === "nej" || v === "no") return false;
  return null;
}

export function asNames(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.map((x) => asString(x, "", 40)).filter(Boolean))].slice(0, max);
}

export function present<T>(xs: (T | null)[]): T[] {
  return xs.filter((x): x is T => x !== null);
}
