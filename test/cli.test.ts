import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectRoutes, generateRoutes } from "../src/cli/generate-routes";

const root = path.resolve(__dirname, "..");
const temporaries: string[] = [];

afterEach(() => {
  for (const dir of temporaries.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Write a fixture tree and return the app directory. */
function writeFixture(tree: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nsr-"));
  temporaries.push(root);

  const appDir = path.join(root, "app");

  for (const [file, contents] of Object.entries(tree)) {
    const full = path.join(appDir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }

  return appDir;
}

describe("duplicate route paths", () => {
  /**
   * Route groups add no path segment, so two of them can serve one URL. Next
   * refuses to build that. The manifest used to dedupe before validating, so
   * `--check` could never see it — the whole point of these tests.
   */
  it("BUG-11: reports two route groups that resolve to the same path", () => {
    const appDir = writeFixture({
      "(marketing)/about/page.tsx": "",
      "(app)/about/page.tsx": "",
    });

    const result = generateRoutes({
      appDir,
      out: path.join(appDir, "..", "routes.json"),
      log: false,
    });

    // Still one entry in the manifest — the URL space really does have one.
    expect(result.routes).toEqual(["/", "/about"]);

    const duplicate = result.conflicts.find((c) => c.kind === "duplicate");
    expect(duplicate).toBeTruthy();
    expect(duplicate!.level).toBe("error");
    expect(duplicate!.routes).toEqual(["/about"]);
    // Naming both folders is what makes it actionable.
    expect(duplicate!.message).toContain("(app)");
    expect(duplicate!.message).toContain("(marketing)");
  });

  it("BUG-11: catches a root page colliding with a grouped root page", () => {
    // `walk` never inspects the app directory itself, so this one is only
    // caught because collectRoutes records the root explicitly.
    const appDir = writeFixture({
      "page.tsx": "",
      "(shop)/page.tsx": "",
    });

    const result = generateRoutes({
      appDir,
      out: path.join(appDir, "..", "routes.json"),
      log: false,
    });

    const duplicate = result.conflicts.find((c) => c.kind === "duplicate");
    expect(duplicate?.level).toBe("error");
    expect(duplicate?.routes).toEqual(["/"]);
  });

  it("BUG-11: a lone root page is not a duplicate of the injected root", () => {
    // "/" is always added to the manifest whether or not app/page.tsx exists.
    // That injection must never be mistaken for a second source.
    const appDir = writeFixture({ "page.tsx": "", "about/page.tsx": "" });

    const result = generateRoutes({
      appDir,
      out: path.join(appDir, "..", "routes.json"),
      log: false,
    });

    expect(result.conflicts).toEqual([]);
  });

  it("BUG-11: an app with no root page is still not a duplicate", () => {
    const appDir = writeFixture({ "about/page.tsx": "" });

    const result = generateRoutes({
      appDir,
      out: path.join(appDir, "..", "routes.json"),
      log: false,
    });

    expect(result.routes).toContain("/");
    expect(result.conflicts).toEqual([]);
  });

  it("BUG-11: records the folder behind every route", () => {
    const appDir = writeFixture({
      "page.tsx": "",
      "(marketing)/about/page.tsx": "",
      "w/[id]/page.tsx": "",
    });

    const { sources } = collectRoutes(appDir);

    expect([...sources.keys()].sort()).toEqual(["/", "/about", "/w/[id]"]);
    expect(sources.get("/about")).toHaveLength(1);
    expect(sources.get("/about")![0]).toContain("about");
  });

  it("BUG-11: skipped folders cannot create a phantom duplicate", () => {
    // Parallel slots and intercepting routes contribute no route, so they must
    // not register a source either.
    const appDir = writeFixture({
      "feed/page.tsx": "",
      "feed/@modal/page.tsx": "",
      "feed/(..)photo/page.tsx": "",
    });

    const result = generateRoutes({
      appDir,
      out: path.join(appDir, "..", "routes.json"),
      log: false,
    });

    expect(result.conflicts).toEqual([]);
  });
});

describe("collectRoutes", () => {
  it("honours every app-directory convention", () => {
    const appDir = writeFixture({
      "page.tsx": "",
      "(marketing)/about/page.tsx": "", //  route group -> /about
      "w/[id]/page.tsx": "",
      "w/[id]/api/page.tsx": "", //          BUG-09: a real page named "api"
      "w/[id]/@modal/page.tsx": "", //       parallel slot -> skipped
      "feed/(..)photo/page.tsx": "", //      BUG-10: intercepting -> skipped
      "feed/page.tsx": "",
      "api/users/route.ts": "", //           route handler -> skipped
      "_internal/page.tsx": "", //           private -> skipped
      "docs/[...slug]/page.tsx": "",
      "files/[[...path]]/page.tsx": "",
    });

    expect(collectRoutes(appDir).routes).toEqual([
      "/",
      "/about",
      "/feed",
      "/w/[id]",
      "/w/[id]/api",
      "/docs/[...slug]",
      "/files/[[...path]]",
    ]);
  });

  it("BUG-09: keeps a page under a folder named api", () => {
    const appDir = writeFixture({ "settings/api/page.tsx": "" });
    expect(collectRoutes(appDir).routes).toContain("/settings/api");
  });

  it("BUG-09: still skips a folder holding only a route handler", () => {
    const appDir = writeFixture({ "api/users/route.ts": "" });
    expect(collectRoutes(appDir).routes).toEqual(["/"]);
  });

  it("BUG-10: skips every intercepting-route spelling", () => {
    const appDir = writeFixture({
      "feed/(.)photo/page.tsx": "",
      "feed/(..)photo/page.tsx": "",
      "feed/(...)photo/page.tsx": "",
      "feed/page.tsx": "",
    });
    expect(collectRoutes(appDir).routes).toEqual(["/", "/feed"]);
  });

  it("BUG-11: honours pageExtensions and finds mdx", () => {
    const appDir = writeFixture({
      "guide/page.mdx": "",
      "other/page.svelte": "",
    });

    expect(collectRoutes(appDir).routes).toContain("/guide");
    expect(collectRoutes(appDir).routes).not.toContain("/other");
    expect(collectRoutes(appDir, { pageExtensions: ["svelte"] }).routes).toContain(
      "/other"
    );
  });

  it("returns routes in specificity order", () => {
    const appDir = writeFixture({
      "docs/[...slug]/page.tsx": "",
      "docs/about/page.tsx": "",
    });
    expect(collectRoutes(appDir).routes).toEqual([
      "/",
      "/docs/about",
      "/docs/[...slug]",
    ]);
  });

  it("collects route.meta.json sidecars", () => {
    const appDir = writeFixture({
      "w/page.tsx": "",
      "w/route.meta.json": JSON.stringify({ title: "Workspaces", requiresAuth: true }),
    });

    expect(collectRoutes(appDir).meta).toEqual({
      "/w": { title: "Workspaces", requiresAuth: true },
    });
  });

  it("respects an explicit ignore list", () => {
    const appDir = writeFixture({ "drafts/page.tsx": "", "live/page.tsx": "" });
    expect(collectRoutes(appDir, { ignore: ["drafts"] }).routes).toEqual([
      "/",
      "/live",
    ]);
  });

  it("throws a useful message for a missing app dir", () => {
    expect(() => collectRoutes("/definitely/not/here")).toThrow(
      /app directory not found/
    );
  });
});

describe("generateRoutes", () => {
  it("emits a TS module with ROUTES and a Route union", () => {
    const appDir = writeFixture({ "page.tsx": "", "w/[id]/page.tsx": "" });
    const out = path.join(path.dirname(appDir), "route-manifest.ts");

    generateRoutes({ appDir, out, log: false });
    const contents = fs.readFileSync(out, "utf8");

    expect(contents).toContain("export const ROUTES = new Set(");
    expect(contents).toContain("export type Route =");
    expect(contents).toContain('| "/w/[id]"');
  });

  it("can skip the type emit", () => {
    const appDir = writeFixture({ "page.tsx": "" });
    const out = path.join(path.dirname(appDir), "manifest.ts");

    generateRoutes({ appDir, out, log: false, emitTypes: false });
    expect(fs.readFileSync(out, "utf8")).not.toContain("export type Route");
  });

  it("emits JSON when the output ends in .json", () => {
    const appDir = writeFixture({ "page.tsx": "", "w/page.tsx": "" });
    const out = path.join(path.dirname(appDir), "routes.json");

    generateRoutes({ appDir, out, log: false });
    expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual(["/", "/w"]);
  });

  it("BUG-12: does not rewrite an unchanged file", () => {
    const appDir = writeFixture({ "page.tsx": "" });
    const out = path.join(path.dirname(appDir), "manifest.ts");

    expect(generateRoutes({ appDir, out, log: false }).changed).toBe(true);

    const before = fs.statSync(out).mtimeMs;
    expect(generateRoutes({ appDir, out, log: false }).changed).toBe(false);
    expect(fs.statSync(out).mtimeMs).toBe(before);
  });

  it("rewrites once a route appears", () => {
    const appDir = writeFixture({ "page.tsx": "" });
    const out = path.join(path.dirname(appDir), "manifest.ts");

    generateRoutes({ appDir, out, log: false });
    fs.mkdirSync(path.join(appDir, "new"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "new", "page.tsx"), "");

    const result = generateRoutes({ appDir, out, log: false });
    expect(result.changed).toBe(true);
    expect(result.routes).toContain("/new");
  });

  it("creates missing output directories", () => {
    const appDir = writeFixture({ "page.tsx": "" });
    const out = path.join(path.dirname(appDir), "deep", "nested", "manifest.ts");

    generateRoutes({ appDir, out, log: false });
    expect(fs.existsSync(out)).toBe(true);
  });

  it("reports conflicts without failing the generate", () => {
    const appDir = writeFixture({
      "w/[id]/page.tsx": "",
      "w/[workspaceId]/page.tsx": "",
    });
    const out = path.join(path.dirname(appDir), "manifest.ts");

    const result = generateRoutes({ appDir, out, log: false });
    expect(result.conflicts.map((c) => c.kind)).toContain("param-name-mismatch");
  });
});

/**
 * The built binary, invoked the way npm actually invokes it.
 *
 * npm's bin entry on Linux and macOS is a symlink named after the command, so
 * `process.argv[1]` is `…/node_modules/.bin/next-smart-router` — not
 * `…/bin.js`. A guard keyed on the filename therefore passed on Windows (whose
 * shim is a .cmd calling `node …in.js`) and silently no-opped everywhere
 * else. These spawn the binary under both names to keep that honest.
 */
describe("built binary", () => {
  const dist = path.join(root, "dist", "cli", "bin.js");
  const built = fs.existsSync(dist);
  const runIfBuilt = built ? it : it.skip;

  function runAs(filename: string, args: string[], cwd: string) {
    const copy = path.join(cwd, filename);
    fs.copyFileSync(dist, copy);
    return execFileSync(process.execPath, [copy, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  runIfBuilt("generates when invoked by its npm bin name, not just as bin.js", () => {
    const appDir = writeFixture({ "page.tsx": "", "w/[id]/page.tsx": "" });
    const cwd = path.dirname(appDir);

    for (const name of ["bin.js", "next-smart-router"]) {
      const out = path.join(cwd, `manifest-${name}.ts`);
      runAs(name, ["generate", "--app-dir", appDir, "--out", out], cwd);

      expect(fs.existsSync(out), `invoked as "${name}"`).toBe(true);
      expect(fs.readFileSync(out, "utf8")).toContain('"/w/[id]"');
    }
  });

  runIfBuilt("prints its version under either name", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nsr-bin-"));
    temporaries.push(cwd);

    for (const name of ["bin.js", "next-smart-router"]) {
      expect(runAs(name, ["--version"], cwd).trim()).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});
