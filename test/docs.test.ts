import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Documentation coverage.
 *
 * An export nobody wrote down may as well not exist, and the gap is invisible
 * in review — you add one name to an entry point and the docs are silently a
 * little more wrong. This asserts every public name is mentioned somewhere in
 * the docs, so adding an export forces a decision about documenting it.
 *
 * Mentioning a name is a low bar on purpose. It catches omission, not quality.
 */

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

/** Names exported from an entry point's `export { … }` blocks. */
function exportedNames(entry: string): string[] {
  const source = read(entry);
  const names = new Set<string>();

  for (const match of source.matchAll(/^\s{2}(?:type\s+)?(\w+),\s*$/gm)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/^export\s+(?:const|function|class)\s+(\w+)/gm)) {
    names.add(match[1]);
  }

  return [...names];
}

const DOCS = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs/README.md",
  "docs/api-reference.md",
  "docs/getting-started.md",
  "docs/concepts.md",
  "docs/recipes.md",
  "docs/cli.md",
  "docs/faq.md",
  "docs/motivation.md",
  "docs/migration-1.0.md",
];

const prose = DOCS.map(read).join("\n");

function undocumented(names: string[]): string[] {
  return names.filter((name) => !new RegExp(`\\b${name}\\b`).test(prose));
}

describe("documentation coverage", () => {
  it("names every export of the core entry", () => {
    const names = exportedNames("src/index.ts");
    expect(names.length).toBeGreaterThan(80);
    expect(undocumented(names)).toEqual([]);
  });

  it("names every export of the react entry", () => {
    const names = exportedNames("src/react.ts");
    expect(names.length).toBeGreaterThan(30);
    expect(undocumented(names)).toEqual([]);
  });

  it("names every export of the plugin and CLI entries", () => {
    const names = [
      ...exportedNames("src/plugin.ts"),
      ...exportedNames("src/cli/index.ts"),
    ];
    expect(undocumented(names)).toEqual([]);
  });

  it("keeps every docs page listed in the docs index", () => {
    const index = read("docs/README.md");
    const pages = fs
      .readdirSync(path.join(root, "docs"))
      .filter((file) => file.endsWith(".md") && file !== "README.md");

    expect(pages.filter((page) => !index.includes(page))).toEqual([]);
  });

  it("has no dead relative links between docs pages", () => {
    const broken: string[] = [];

    for (const file of DOCS) {
      const dir = path.dirname(path.join(root, file));

      for (const match of read(file).matchAll(/]\((\.[^)#]*?)(?:#[^)]*)?\)/g)) {
        const target = path.resolve(dir, match[1]);
        if (!fs.existsSync(target)) broken.push(`${file} → ${match[1]}`);
      }
    }

    expect(broken).toEqual([]);
  });
});
