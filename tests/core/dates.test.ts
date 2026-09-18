import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  diffDays,
  formatDay,
  formatPlanDate,
  formatStamp,
  maxIso,
  minIso,
  mondayOf,
  todayInCopenhagen,
  weekKey,
  weekNumber,
  weekNumberFromKey,
  weekYear,
} from "@/core/dates";

/**
 * Dates are plain ISO strings everywhere in Domino, computed in
 * Europe/Copenhagen. A plan that reads "flyttet til fredag" must mean the
 * same Friday on a server in another timezone.
 */

describe("date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysIso("2026-09-01", 1)).toBe("2026-09-02");
    expect(addDaysIso("2026-09-29", 3)).toBe("2026-10-02");
    expect(addDaysIso("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("counts the difference in days, in both directions", () => {
    expect(diffDays("2026-09-01", "2026-09-08")).toBe(7);
    expect(diffDays("2026-09-08", "2026-09-01")).toBe(-7);
    expect(diffDays("2026-09-01", "2026-09-01")).toBe(0);
  });

  it("is not thrown by the change to summer time", () => {
    expect(addDaysIso("2026-03-28", 1)).toBe("2026-03-29");
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(addDaysIso("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-09-01")).toBe("2026-08-31"); // Tuesday
    expect(mondayOf("2026-08-31")).toBe("2026-08-31"); // Monday itself
    expect(mondayOf("2026-09-06")).toBe("2026-08-31"); // Sunday belongs to its week
  });

  it("finds the smallest and largest date", () => {
    expect(minIso(["2026-09-10", "2026-09-01", "2026-10-01"])).toBe("2026-09-01");
    expect(maxIso(["2026-09-10", "2026-09-01", "2026-10-01"])).toBe("2026-10-01");
  });
});

describe("ISO week numbers", () => {
  it("counts weeks the way a Danish calendar does", () => {
    expect(weekNumber("2026-09-01")).toBe(36);
    expect(weekNumber("2026-01-01")).toBe(1);
    expect(weekNumber("2026-12-31")).toBe(53);
  });

  it("puts a week that straddles new year in the year that owns it", () => {
    expect(weekYear("2027-01-01")).toBe(2026);
    expect(weekKey("2027-01-01")).toBe("2026-W53");
    expect(weekKey("2026-09-01")).toBe("2026-W36");
    expect(weekNumberFromKey("2026-W36")).toBe(36);
  });
});

describe("today", () => {
  it("is read in Copenhagen, not in UTC", () => {
    // 23:30 UTC on the last day of August is already September in Copenhagen.
    expect(todayInCopenhagen(new Date("2026-08-31T23:30:00Z"))).toBe("2026-09-01");
    expect(todayInCopenhagen(new Date("2026-09-01T10:00:00Z"))).toBe("2026-09-01");
  });
});

describe("readable dates", () => {
  it("writes a plan date in the reader's language, day first in both", () => {
    expect(formatPlanDate("2026-09-01", "da")).toBe("01.09.2026");
    expect(formatPlanDate("2026-09-01", "en")).toBe("01/09/2026");
  });

  it("never lets a timezone move a plan date to another day", () => {
    // A plan date carries no clock; the first of a month must not become
    // the last of the one before it because the server sits west of us.
    expect(formatPlanDate("2026-01-01", "da")).toBe("01.01.2026");
    expect(formatPlanDate("2026-12-31", "en")).toBe("31/12/2026");
  });

  it("leaves anything that is not a plan date alone", () => {
    expect(formatPlanDate("", "da")).toBe("");
    expect(formatPlanDate("nonsense", "en")).toBe("nonsense");
  });

  it("writes a moment as a day and as a stamp, in Copenhagen", () => {
    const at = new Date("2026-08-26T22:30:00Z");
    // Half past midnight in Copenhagen: the day is already the 27th.
    expect(formatDay(at, "da")).toContain("27");
    expect(formatDay(at, "en")).toBe("27 Aug 2026");
    expect(formatStamp(at, "en")).toBe("27/08/2026, 00:30");
  });

  it("reads a moment's day in Copenhagen, which an ISO slice does not", () => {
    // The trap the workspace page fell into: a workspace created between
    // midnight and 02:00 here is still the day before in UTC, so
    // `createdAt.toISOString().slice(0, 10)` dated it a day early.
    const justAfterMidnight = new Date("2026-09-15T22:30:00Z");
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe("2026-09-15");
    expect(formatDay(justAfterMidnight, "da")).toContain("16");
    expect(formatDay(justAfterMidnight, "en")).toContain("16");
  });

  it("keeps the clock day-first and 24-hour in both languages", () => {
    // The about page used to hand next-intl's "en" straight to Intl,
    // which resolves to en-US: "September 16, 2026 at 12:28 PM" beside a
    // day-first product. Every stamp comes from here instead.
    const at = new Date("2026-09-16T10:28:00Z");
    expect(formatStamp(at, "da")).toBe("16.09.2026, 12.28");
    expect(formatStamp(at, "en")).toBe("16/09/2026, 12:28");
    expect(formatStamp(at, "en")).not.toMatch(/AM|PM/);
  });
});
