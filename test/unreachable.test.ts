import { describe, expect, it } from "vitest";

import { findUnreachableRoutes, witnessUrls } from "../src/core/unreachable";

/**
 * Every case in "reachable route sets" is a counterexample that a previous
 * version of the witness algorithm reported as dead code. They are regression
 * tests, not examples — each one cost a review round.
 */
describe("findUnreachableRoutes — reachable route sets stay clean", () => {
  const clean: Array<[string, string[]]> = [
    // A catch-all beside a DEEPER dynamic sibling. The length-1 witness wins.
    ["catch-all vs deeper dynamic pair", ["/docs/[...slug]", "/docs/[a]/[b]"]],
    // A hard-coded "x" filler would collide with the static sibling and lose.
    ["dynamic vs a static sibling", ["/w/[id]", "/w/x"]],
    // Needs a witness at maxRouteDepth + 1: bound "maxRouteDepth" flags this.
    ["catch-all vs same-depth dynamic chain", ["/[...s]", "/[a]", "/[a]/[b]"]],
    // Wins ONLY in its zero-segment form; excluding that witness flags it.
    [
      "optional catch-all reachable only at zero segments",
      ["/files/[[...p]]", "/files/[a]", "/files/[a]/[...b]"],
    ],
    // The shape the zero-segment exclusion was wrongly justified by.
    ["optional catch-all beside its parent", ["/files", "/files/[[...path]]"]],
    // A hard-coded "a/b" catch-all tail would collide with both statics.
    ["catch-all vs static tail chain", ["/docs/[...slug]", "/docs/a", "/docs/a/b"]],
  ];

  for (const [name, routes] of clean) {
    it(`U-clean: ${name}`, () => {
      expect(findUnreachableRoutes(routes)).toEqual([]);
    });
  }

  it("U-01: never flags the root that createRouteState injects", () => {
    // The caller never declared "/", so "/" is not their dead route.
    const result = findUnreachableRoutes(["/docs/[a]"]);
    expect(result.map((r) => r.route)).not.toContain("/");
  });

  it("U-02: an empty set has nothing to report", () => {
    expect(findUnreachableRoutes([])).toEqual([]);
  });

  it("U-03: a single route is always reachable", () => {
    expect(findUnreachableRoutes(["/w/[id]/settings"])).toEqual([]);
  });

  it("U-04: duplicates collapse rather than flagging themselves", () => {
    expect(findUnreachableRoutes(["/w/[id]", "/w/[id]"])).toEqual([]);
  });
});

describe("findUnreachableRoutes — genuinely dead routes", () => {
  it("U-05: flags a route a same-shape sibling shadows at every depth", () => {
    // Both patterns match exactly the same URL space, and specificity ordering
    // means the first one always wins, so the second can never be served.
    const [dead, ...rest] = findUnreachableRoutes(["/w/[id]", "/w/[other]"]);

    expect(rest).toEqual([]);
    expect(dead.route).toBe("/w/[other]");
    expect(dead.witnesses.length).toBeGreaterThan(0);
  });

  it("U-06: attaches a proof URL naming what beat it", () => {
    const [dead] = findUnreachableRoutes(["/w/[id]", "/w/[other]"]);

    for (const witness of dead.witnesses) {
      expect(witness.url.startsWith("/")).toBe(true);
      expect(witness.wonBy).not.toBe("/w/[other]");
    }
    expect(dead.witnesses.some((w) => w.wonBy === "/w/[id]")).toBe(true);
  });
});

describe("witnessUrls", () => {
  it("U-07: uses fresh tokens that cannot collide with a static segment", () => {
    const urls = witnessUrls("/w/[id]", ["/w/[id]", "/w/x", "/w/__nsr0"]);

    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toBe("/w/x");
    // __nsr0 is taken by a real static route, so the generator must skip it.
    expect(urls[0]).not.toBe("/w/__nsr0");
  });

  it("U-08: runs a catch-all one level past the deepest route in the set", () => {
    // Deepest route is 3 segments, so the longest witness path is 4 segments.
    const urls = witnessUrls("/[...s]", ["/[...s]", "/[a]", "/[a]/[b]/[c]"]);
    const depths = urls.map((u) => u.split("/").filter(Boolean).length);

    expect(Math.max(...depths)).toBe(4);
    expect(Math.min(...depths)).toBe(1);
  });

  it("U-09: keeps the zero-segment witness for an optional catch-all", () => {
    const urls = witnessUrls("/files/[[...p]]", ["/files/[[...p]]", "/files/[a]"]);

    expect(urls).toContain("/files");
  });

  it("U-10: a static route witnesses as itself", () => {
    expect(witnessUrls("/w/settings", ["/w/settings"])).toEqual(["/w/settings"]);
  });

  it("U-11: the root witnesses as the root", () => {
    expect(witnessUrls("/", ["/", "/w"])).toEqual(["/"]);
  });
});
