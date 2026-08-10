import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Manifest rules that only bite at `npm publish` time.
 *
 * Both cases below shipped past `publint` and past `npm publish --dry-run`,
 * which skips the checks that fail for real. They are cheap to assert here.
 */

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
  bin?: Record<string, string>;
  files?: string[];
  publishConfig?: Record<string, unknown>;
  exports?: Record<string, unknown>;
};

describe("package manifest", () => {
  it('declares bin paths without a "./" prefix', () => {
    // npm >= 11 rejects "./dist/cli/bin.js" and strips the entry from the
    // published manifest entirely — the tarball ships with no bin at all and
    // `npx next-smart-router` becomes "command not found". It warns rather
    // than failing, so the publish appears to succeed.
    for (const [name, target] of Object.entries(pkg.bin ?? {})) {
      expect(target, `bin["${name}"]`).not.toMatch(/^\.\//);
      expect(target, `bin["${name}"]`).not.toMatch(/^\//);
    }
  });

  it("ships every bin target inside a published directory", () => {
    const published = pkg.files ?? [];

    for (const [name, target] of Object.entries(pkg.bin ?? {})) {
      expect(
        fs.existsSync(path.join(root, target)) || target.startsWith("dist"),
        `bin["${name}"] target`
      ).toBe(true);
      expect(
        published.some((entry) => target.startsWith(entry.replace(/\/$/, ""))),
        `bin["${name}"] is covered by "files"`
      ).toBe(true);
    }
  });

  it("does not force provenance from publishConfig", () => {
    // `provenance: true` makes npm generate an attestation, which only works on
    // a supported CI provider. Anywhere else — including a maintainer's laptop —
    // publish dies with "Automatic provenance generation not supported for
    // provider: null". CI opts in through NPM_CONFIG_PROVENANCE instead, and
    // OIDC trusted publishing attaches provenance without being asked.
    expect(pkg.publishConfig?.provenance).toBeUndefined();
  });

  it("maps every export condition to a types file of the matching flavour", () => {
    const walk = (node: unknown, trail: string): void => {
      if (typeof node !== "object" || node === null) return;

      const entry = node as Record<string, any>;

      if (entry.import?.types) {
        expect(entry.import.types, `${trail} import`).toMatch(/\.d\.ts$/);
      }
      if (entry.require?.types) {
        // The classic bug: CJS consumers resolving the ESM declarations.
        expect(entry.require.types, `${trail} require`).toMatch(/\.d\.cts$/);
      }

      for (const [key, value] of Object.entries(entry)) {
        if (key !== "import" && key !== "require") walk(value, `${trail}${key}`);
      }
    };

    walk(pkg.exports, ".");
  });
});
