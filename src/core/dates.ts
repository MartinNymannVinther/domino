/**
 * Shared calendar helpers, taken with the foundation. Dates are ISO
 * strings (yyyy-mm-dd) pinned to Europe/Copenhagen — the server may run
 * in UTC, but "today" for a person in Denmark is the Danish today. Arithmetic runs in UTC so it
 * is safe across DST.
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInCopenhagen(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y ?? 1970, (m ?? 1) - 1, d ?? 1];
}

/** Pure date arithmetic on ISO strings. */
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = parts(dateIso);
  return new Date(Date.UTC(y, m, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm, bd) - Date.UTC(ay, am, ad)) / 86_400_000);
}

export function minIso(dates: string[]): string {
  return dates.reduce((a, b) => (a < b ? a : b));
}

export function maxIso(dates: string[]): string {
  return dates.reduce((a, b) => (a > b ? a : b));
}

/** Monday of the week the date falls in. */
export function mondayOf(iso: string): string {
  const [y, m, d] = parts(iso);
  const date = new Date(Date.UTC(y, m, d));
  const dayNr = (date.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -dayNr);
}

/** ISO 8601 week number, the one Danish calendars use. */
export function weekNumber(iso: string): number {
  const [y, m, d] = parts(iso);
  const target = new Date(Date.UTC(y, m, d));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604_800_000);
}

/** The ISO week's year, which differs from the calendar year at the edges. */
export function weekYear(iso: string): number {
  const [y, m, d] = parts(iso);
  const target = new Date(Date.UTC(y, m, d));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  return target.getUTCFullYear();
}

/** "2026-W37": a stable key for the week a status belongs to. */
export function weekKey(iso: string): string {
  return `${weekYear(iso)}-W${String(weekNumber(iso)).padStart(2, "0")}`;
}

export function weekNumberFromKey(key: string): number {
  return Number(key.split("-W")[1] ?? 0);
}

/**
 * Dates in the reader's language, in one place.
 *
 * English here is British English, not American: the product is Danish
 * and day-first everywhere, and "9/16/26" beside "16.09.2026" on the
 * same page is worse than an unfamiliar separator. Every surface goes
 * through these three, so a page cannot mix three styles by accident.
 */
function intlLocale(locale: string): string {
  return locale === "en" ? "en-GB" : "da-DK";
}

/** A plan date: "26.08.2026" in Danish, "26/08/2026" in English. */
export function formatPlanDate(dateIso: string, locale: string): string {
  if (!ISO_DATE.test(dateIso)) return dateIso;
  const [y, m, d] = parts(dateIso);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    // A plan date carries no clock, so it must not be moved by one.
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m, d)));
}

/** A moment as the day it happened: "26. aug. 2026" / "26 Aug 2026". */
export function formatDay(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Copenhagen",
  }).format(value);
}

/**
 * A moment with its clock: "26.08.2026, 14.05" / "26/08/2026, 14:05".
 * Used by the activity feed and by anything else that states a point in
 * time — a build stamp, a migration's arrival — so a page never grows a
 * long date with an am/pm clock of its own beside these.
 */
export function formatStamp(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }).format(value);
}
