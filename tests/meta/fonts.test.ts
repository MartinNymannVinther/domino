import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The type is in the repository and the build reaches for nothing.
 *
 * `next/font/google` self-hosts what it downloads, so there was never a
 * runtime call to Google - but `pnpm build`, and so every `docker build`,
 * fetched fonts.googleapis.com. That makes the build non-hermetic and puts
 * a US host in the path of it, which dogma two does not allow: cut the
 * internet and everything essential still works, building included.
 *
 * So the faces are files now, and these are the three ways that can rot:
 * an import of next/font creeping back in, a rule pointing at a file that
 * is not there, and a file sitting there that no rule opens. The last one
 * is the debt this replaced - `public/fonts` carried Ajour's two Archivo
 * `.ttf` files for a whole release, read by a PDF renderer Domino does not
 * have. They are gone, and the sweep below is over every font file in the
 * directory rather than only the ones in use, so the next leftover is
 * caught by the suite instead of by a reader a release later.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const FONT_DIR = join(ROOT, "public", "fonts");
const GLOBALS = join(ROOT, "src", "app", "globals.css");
const LAYOUT = join(ROOT, "src", "app", "[locale]", "layout.tsx");

/**
 * Comments out. Both halves of this change had to explain themselves in
 * prose that names `next/font` and fonts.googleapis.com, and a sweep that
 * cannot tell the explanation from the thing explained would ban writing
 * it down. Block comments are valid in TypeScript and CSS alike; only a
 * whole-line `//` is stripped, so a `https://` inside a rule survives.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx|js|jsx|css)$/.test(entry.name) ? [path] : [];
    }),
  );
  return found.flat();
}

describe("fonts", () => {
  it("are never fetched from Google at build time", async () => {
    const files = await sourceFiles(join(ROOT, "src"));
    const offenders: string[] = [];
    for (const file of files) {
      const source = withoutComments(await readFile(file, "utf8"));
      if (/next\/font/.test(source) || /fonts\.(googleapis|gstatic)\.com/.test(source)) {
        offenders.push(file.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("are served from this repository and nowhere else", async () => {
    const css = await readFile(GLOBALS, "utf8");
    const urls = [...css.matchAll(/src:\s*url\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^\/fonts\/[\w.-]+\.woff2$/);
  });

  it("every rule points at a file that is here", async () => {
    const css = await readFile(GLOBALS, "utf8");
    const named = new Set(
      [...css.matchAll(/url\("\/fonts\/([\w.-]+\.woff2)"\)/g)].map((m) => m[1]!),
    );
    const present = new Set((await readdir(FONT_DIR)).filter((f) => f.endsWith(".woff2")));
    expect([...named].filter((f) => !present.has(f))).toEqual([]);
  });

  it("every file that is here has a rule that opens it", async () => {
    const css = await readFile(GLOBALS, "utf8");
    // Any font file, not only the ones the stylesheet happens to name:
    // a face nobody reads is the debt this replaced.
    const present = (await readdir(FONT_DIR)).filter((f) => /\.(woff2?|ttf|otf|eot)$/i.test(f));
    expect(present.length).toBeGreaterThan(0);
    expect(present.filter((f) => !css.includes(`/fonts/${f}`))).toEqual([]);
  });

  it("preloads only faces the stylesheet declares", async () => {
    const layout = await readFile(LAYOUT, "utf8");
    const css = await readFile(GLOBALS, "utf8");
    const preloaded = [...layout.matchAll(/"(\/fonts\/[\w.-]+\.woff2)"/g)].map((m) => m[1]!);
    expect(preloaded).toHaveLength(2);
    for (const href of preloaded) expect(css).toContain(`url("${href}")`);
  });

  it("ship the licence of every family they use", async () => {
    const css = await readFile(GLOBALS, "utf8");
    const families = new Set(
      [...css.matchAll(/font-family:\s*"([^"]+)"/g)]
        .map((m) => m[1]!)
        .filter((name) => !name.endsWith("Fallback")),
    );
    expect([...families].sort()).toEqual(["Archivo", "Geist Mono"]);
    const licences = (await readdir(FONT_DIR)).filter((f) => f.startsWith("OFL"));
    expect(licences.sort()).toEqual(["OFL-Geist.txt", "OFL.txt"]);
    const readme = await readFile(join(ROOT, "README.md"), "utf8");
    for (const licence of licences) expect(readme).toContain(`public/fonts/${licence}`);
  });
});
