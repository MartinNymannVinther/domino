import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import da from "../../messages/da.json";
import en from "../../messages/en.json";

/**
 * next-intl resolves message keys at render time, so a key pointing at
 * the wrong namespace compiles, builds, and only breaks in front of the
 * user. This walks the source for `useTranslations`/`getTranslations`
 * namespaces and the literal keys used against them, and proves every one
 * exists — the check the type system does not do for us.
 *
 * Keys built at runtime (`t(`status.${x}`)`) are skipped: they cannot be
 * resolved statically, and guessing would make this test lie.
 */

type Messages = { [key: string]: string | Messages };

function collectKeys(node: Messages, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") keys.add(path);
    else for (const nested of collectKeys(value, path)) keys.add(nested);
  }
  return keys;
}

function resolve(node: Messages, path: string): string | Messages | undefined {
  return path.split(".").reduce<string | Messages | undefined>((current, part) => {
    if (current === undefined || typeof current === "string") return undefined;
    return current[part];
  }, node);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const daKeys = collectKeys(da as Messages);
const enKeys = collectKeys(en as Messages);

describe("message catalogues", () => {
  it("da and en carry exactly the same keys", () => {
    const onlyDa = [...daKeys].filter((key) => !enKeys.has(key)).sort();
    const onlyEn = [...enKeys].filter((key) => !daKeys.has(key)).sort();
    expect({ onlyDa, onlyEn }).toEqual({ onlyDa: [], onlyEn: [] });
  });
});

describe("keys used in the app", () => {
  it("every literal key resolves in both catalogues", () => {
    const missing: string[] = [];

    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");

      const namespaces = new Map<string, string>();
      const declaration =
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g;
      for (const match of source.matchAll(declaration)) {
        namespaces.set(match[1]!, match[2]!);
      }
      if (namespaces.size === 0) continue;

      for (const [variable, namespace] of namespaces) {
        const usage = new RegExp(`\\b${variable}\\(\\s*"([^"]+)"`, "g");
        for (const match of source.matchAll(usage)) {
          const path = `${namespace}.${match[1]!}`;
          for (const [locale, catalogue] of [
            ["da", da],
            ["en", en],
          ] as const) {
            if (typeof resolve(catalogue as Messages, path) !== "string") {
              missing.push(`${file}: ${locale} mangler "${path}"`);
            }
          }
        }
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});

/**
 * A message that names the board's estimate unit (docs/adr/0030) reads
 * `{unit, select, …}`, and next-intl refuses the whole string when no
 * unit is handed over — the sentence disappears in front of the user,
 * which is how one was found in the sprint's close dialog. This proves
 * every call site of such a message passes one.
 *
 * The scan below is static, so it sees only literal keys. Backlog care
 * asks for its findings with a key built at runtime
 * (`t(`${finding.key}.body`)`, src/components/overview/care-list.tsx),
 * and no static reader can follow that; `care.tooDeep.body` is covered
 * instead by rendering it in tests/i18n/unit-sentences.test.ts, which
 * walks the whole `care.*.body` family through the catalogue.
 */
describe("messages that name the estimate unit", () => {
  const unitKeys = [...daKeys].filter((key) => {
    const value = resolve(da as Messages, key);
    return typeof value === "string" && value.includes("{unit");
  });

  it("are asked for with a unit at every call site", () => {
    const missing: string[] = [];

    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      const namespaces = new Map<string, string>();
      const declaration =
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g;
      for (const match of source.matchAll(declaration)) {
        namespaces.set(match[1]!, match[2]!);
      }

      for (const [variable, namespace] of namespaces) {
        const usage = new RegExp(`\\b${variable}\\(\\s*"([^"]+)"`, "g");
        for (const match of source.matchAll(usage)) {
          if (!unitKeys.includes(`${namespace}.${match[1]!}`)) continue;
          // Read the call to its closing bracket; the values object, if
          // any, has to mention a unit.
          const rest = source.slice(match.index!);
          let depth = 0;
          let end = rest.length;
          for (let i = 0; i < rest.length; i += 1) {
            if (rest[i] === "(") depth += 1;
            else if (rest[i] === ")") {
              depth -= 1;
              if (depth === 0) {
                end = i;
                break;
              }
            }
          }
          if (!/\bunit\b/.test(rest.slice(0, end))) {
            missing.push(`${file}: "${namespace}.${match[1]!}" uden unit`);
          }
        }
      }
    }

    expect(missing.sort()).toEqual([]);
  });

  it("always offer a branch for any unit, so no value can break the sentence", () => {
    const broken: string[] = [];
    for (const key of unitKeys) {
      for (const [locale, catalogue] of [
        ["da", da],
        ["en", en],
      ] as const) {
        const value = resolve(catalogue as Messages, key);
        if (typeof value !== "string") continue;
        // The select holds nested braces, so look for the branch itself.
        if (value.includes("{unit,") && !value.includes("other {")) {
          broken.push(`${locale}: "${key}" mangler en other-gren`);
        }
      }
    }
    expect(broken.sort()).toEqual([]);
  });

  /**
   * A select with only `hours` and `other` tells a T-shirt board its work
   * is measured in points, on the same page whose cards read "L". A size
   * names one card and there is no word for a total of sizes, so a sum on
   * such a board is a weight (docs/adr/0030) — which is a branch of its
   * own, never the leftover one.
   */
  it("spell out a T-shirt branch rather than letting sizes fall through to points", () => {
    const missing: string[] = [];
    for (const key of unitKeys) {
      for (const [locale, catalogue] of [
        ["da", da],
        ["en", en],
      ] as const) {
        const value = resolve(catalogue as Messages, key);
        if (typeof value !== "string" || !value.includes("{unit,")) continue;
        for (const branch of ["hours {", "tshirt {"]) {
          if (!value.includes(branch)) {
            missing.push(`${locale}: "${key}" mangler gren ${branch.slice(0, -2)}`);
          }
        }
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  /**
   * "{points} {unit, select, hours {timer} other {point}}" leaves the
   * number outside the select, so no branch can ever agree with it: it
   * reads "1 points" in English and "1 timer" on a Danish hours board.
   * The number has to live inside the branch that knows its noun.
   */
  it("keep the count inside the branch that names it", () => {
    const outside = /\{\w+\}\s+\{unit,/;
    const found: string[] = [];
    for (const key of unitKeys) {
      for (const [locale, catalogue] of [
        ["da", da],
        ["en", en],
      ] as const) {
        const value = resolve(catalogue as Messages, key);
        if (typeof value === "string" && outside.test(value)) {
          found.push(`${locale}: "${key}" tæller uden for sin select`);
        }
      }
    }
    expect(found.sort()).toEqual([]);
  });

  /**
   * English pluralises and Danish mostly does not, so a bare "{cards}
   * cards" reads "1 cards". A count in front of an English noun has to go
   * through a plural — either its own, or one wrapped around the clause.
   */
  it("never put a bare count in front of an English noun", () => {
    const bare = /\{(\w+)\}\s+(points?|hours?|cards?|features?|epics?|sprints?)\b/g;
    const found: string[] = [];
    for (const key of unitKeys) {
      const value = resolve(en as Messages, key);
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(bare)) {
        // A clause wrapped in `{n, plural, …}` already chose the noun form.
        if (value.includes(`{${match[1]!}, plural`)) continue;
        found.push(`en: "${key}" skriver "${match[0]}" uden plural`);
      }
    }
    expect(found.sort()).toEqual([]);
  });
});

/**
 * The same rule as the unit sentences', over the whole English
 * catalogue. English has no invariant plural to hide behind: "{cards}
 * cards" reads "1 cards" the first week a board is used, and the only
 * reason the first sweep missed eleven of them is that it looked only
 * where an estimate was named.
 */
describe("every English sentence that counts something", () => {
  it("never puts a bare count in front of a noun", () => {
    const bare =
      /\{(\w+)\}\s+(points?|hours?|cards?|features?|epics?|sprints?|days?|weeks?|themes?|areas?|comments?|members?|people|releases?)\b/g;
    const found: string[] = [];
    for (const key of daKeys) {
      const value = resolve(en as Messages, key);
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(bare)) {
        // A clause already wrapped in `{n, plural, …}` chose its noun form.
        if (value.includes(`{${match[1]!}, plural`)) continue;
        found.push(`en: "${key}" skriver "${match[0]}" uden plural`);
      }
    }
    expect(found.sort()).toEqual([]);
  });
});
