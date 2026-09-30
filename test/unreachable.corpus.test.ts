import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRouter } from "../src/core/create-router";
import { findUnreachableRoutes } from "../src/core/unreachable";

/**
 * Corpus regression for the unreachable-route detector.
 *
 * The corpus is generated OFFLINE and committed. CI only replays it.
 *
 *   NSR_REGEN_CORPUS=1 npx vitest run test/unreachable.corpus.test.ts
 *
 * Why not fuzz in CI: `npm test` runs nine times in the matrix (node 18/20/22
 * x next 13.5/14/15) and once more on the publish path before `changeset
 * publish`. An unseeded fuzzer there is a failure you cannot reproduce, at the
 * moment you are least able to investigate it. Generation is also the only
 * step that touches Next's internals or does the O(alphabet^depth) ground
 * truth search, so replaying keeps CI fast and dependency-free.
 *
 * Every verdict in the corpus was verified at generation time against an
 * exhaustive URL search, so this file is asserting against ground truth, not
 * against a previous run of the same code.
 */

const CORPUS_PATH = path.resolve(__dirname, "fixtures/unreachable-corpus.json");

interface CorpusCase {
  routes: string[];
  /** Ground-truth-verified unreachable routes, sorted. */
  unreachable: string[];
}

interface Corpus {
  seed: number;
  note: string;
  setsConsidered: number;
  cases: CorpusCase[];
}

/* -------------------------------------------------
 * Generation (offline only)
 * ------------------------------------------------- */

/** Deterministic PRNG, so a regenerated corpus is byte-identical. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOCAB = ["a", "b", "[x]", "[...s]", "[[...s]]"];

function legalPatterns(maxDepth: number): string[] {
  let out = [""];
  for (let d = 0; d < maxDepth; d++) {
    const grown: string[] = [];
    for (const p of out) for (const v of VOCAB) grown.push(`${p}/${v}`);
    out = out.concat(grown);
  }
  return [...new Set(out.map((p) => p || "/"))].filter((p) => {
    const segs = p.split("/").filter(Boolean);
    // A catch-all anywhere but last can never match; Next rejects it too.
    return segs.every(
      (s, i) =>
        !(s.startsWith("[...") || s.startsWith("[[...")) || i === segs.length - 1
    );
  });
}

/**
 * Is `route` reachable by ANY url, searched exhaustively?
 *
 * The alphabet is every static segment in the set plus one token that appears
 * nowhere, which is sufficient: a dynamic segment cannot distinguish two
 * tokens that are both absent from the statics.
 */
function reachableByBruteForce(
  routes: string[],
  route: string,
  maxDepth: number
): boolean {
  const router = createRouter(routes);
  const alphabet = new Set<string>(["Zz9"]);
  for (const p of routes) {
    for (const s of p.split("/").filter(Boolean))
      if (!s.startsWith("[")) alphabet.add(s);
  }

  let urls = [""];
  if (router.match("/")?.route === route) return true;
  for (let d = 0; d < maxDepth; d++) {
    const grown: string[] = [];
    for (const u of urls) {
      for (const token of alphabet) {
        const next = `${u}/${token}`;
        if (router.match(next)?.route === route) return true;
        grown.push(next);
      }
    }
    urls = grown;
  }
  return false;
}

async function regenerate(): Promise<Corpus> {
  const { getSortedRoutes } =
    (await import("next/dist/shared/lib/router/utils/sorted-routes")) as {
      getSortedRoutes: (r: string[]) => string[];
    };

  const seed = 20260911;
  const rand = mulberry32(seed);
  const all = legalPatterns(3);
  const pick = (n: number) => Math.floor(rand() * n);

  const cases: CorpusCase[] = [];
  let considered = 0;
  const flagged: CorpusCase[] = [];
  const clean: CorpusCase[] = [];

  for (let i = 0; i < 40000 && flagged.length < 200; i++) {
    const size = 2 + pick(4);
    const routes = [
      ...new Set(Array.from({ length: size }, () => all[pick(all.length)])),
    ];
    if (routes.length < 2) continue;

    // Only keep sets Next itself accepts: those are the legal App Router
    // shapes, and the ones a false positive would actually hurt someone on.
    try {
      getSortedRoutes(routes);
    } catch {
      continue;
    }
    considered++;

    const unreachable = findUnreachableRoutes(routes)
      .map((u) => u.route)
      .sort();

    // Ground truth. A flagged route that brute force can reach is a bug, and
    // the corpus must never record one.
    for (const route of unreachable) {
      if (reachableByBruteForce(routes, route, 4)) {
        throw new Error(
          `FALSE POSITIVE: ${JSON.stringify(routes)} flagged ${route}, but a URL reaches it`
        );
      }
    }

    const entry = { routes: routes.sort(), unreachable };
    (unreachable.length ? flagged : clean).push(entry);
  }

  // Keep every flagged case plus a slice of clean ones: the clean cases are
  // what guard against the detector becoming trigger-happy.
  cases.push(...flagged, ...clean.slice(0, 150));

  return {
    seed,
    note:
      "Generated offline by NSR_REGEN_CORPUS=1. Every verdict verified against " +
      "an exhaustive URL search at generation time. Do not hand-edit.",
    setsConsidered: considered,
    cases,
  };
}

/* -------------------------------------------------
 * Tests
 * ------------------------------------------------- */

const REGEN = process.env.NSR_REGEN_CORPUS === "1";

describe("unreachable-route corpus", () => {
  if (REGEN) {
    it("regenerates the committed corpus", async () => {
      const corpus = await regenerate();
      fs.mkdirSync(path.dirname(CORPUS_PATH), { recursive: true });
      fs.writeFileSync(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`);

      expect(corpus.cases.length).toBeGreaterThan(100);
      console.log(
        `corpus: ${corpus.cases.length} cases from ${corpus.setsConsidered} Next-accepted sets`
      );
    }, 600_000);
    return;
  }

  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8")) as Corpus;

  it("X-01: the corpus is present and substantial", () => {
    expect(corpus.cases.length).toBeGreaterThan(100);
    expect(corpus.cases.some((c) => c.unreachable.length > 0)).toBe(true);
    expect(corpus.cases.some((c) => c.unreachable.length === 0)).toBe(true);
  });

  it("X-02: reproduces every verified verdict exactly", () => {
    const mismatches: string[] = [];

    for (const testCase of corpus.cases) {
      const actual = findUnreachableRoutes(testCase.routes)
        .map((u) => u.route)
        .sort();

      if (JSON.stringify(actual) !== JSON.stringify(testCase.unreachable)) {
        mismatches.push(
          `${JSON.stringify(testCase.routes)}\n  expected ${JSON.stringify(testCase.unreachable)}\n  actual   ${JSON.stringify(actual)}`
        );
      }
    }

    expect(mismatches.join("\n")).toBe("");
  });

  it("X-03: every flagged route still has a proof witness attached", () => {
    for (const testCase of corpus.cases) {
      for (const found of findUnreachableRoutes(testCase.routes)) {
        expect(found.witnesses.length, found.route).toBeGreaterThan(0);
        expect(found.witnesses.every((w) => w.wonBy !== found.route)).toBe(true);
      }
    }
  });
});
