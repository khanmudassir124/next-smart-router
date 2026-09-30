import { describe, expect, it } from "vitest";

import { explain, explainIn } from "../src/core/explain";
import { explainPatternMatch, matchRouteIn } from "../src/core/route-matcher";
import { createRouteState } from "../src/core/route-state";

const ROUTES = [
  "/",
  "/workspaces",
  "/workspaces/[id]",
  "/workspaces/[id]/settings",
  "/docs/about",
  "/docs/[...slug]",
  "/files/[[...path]]",
];

describe("explain", () => {
  it("E-01: agrees with matchRouteIn on every fixture path", () => {
    // The whole point of one shared walk: these two can never disagree.
    const state = createRouteState(ROUTES);
    const paths = [
      "/",
      "/workspaces",
      "/workspaces/42",
      "/workspaces/42/settings",
      "/docs/about",
      "/docs/a/b/c",
      "/files",
      "/files/a/b",
      "/nothing/here",
    ];

    for (const path of paths) {
      const oracle = matchRouteIn(state, path);
      const winner = explainIn(state, path).winner;

      expect(winner?.route ?? null, path).toBe(oracle?.route ?? null);
      expect(winner?.params ?? null, path).toEqual(oracle?.params ?? null);
    }
  });

  it("E-02: ranks the winner within the ordered total", () => {
    const result = explain("/workspaces/42/settings", ROUTES);

    expect(result.winner?.route).toBe("/workspaces/[id]/settings");
    expect(result.total).toBe(ROUTES.length);
    expect(result.winner!.rank).toBeGreaterThan(0);
    expect(result.winner!.rank).toBeLessThanOrEqual(result.total);
  });

  it("E-03: reports patterns that matched but lost", () => {
    const result = explain("/w/42/settings", [
      "/w/[id]",
      "/w/[id]/[tab]",
      "/w/[id]/settings",
    ]);

    expect(result.winner?.route).toBe("/w/[id]/settings");
    expect(result.nearMisses.map((n) => n.route)).toEqual(["/w/[id]/[tab]"]);
    // The loser's params are captured too — that is the useful part.
    expect(result.nearMisses[0].params).toEqual({ id: "42", tab: "settings" });
  });

  it("E-04: does not cap near misses (the view does)", () => {
    const routes = ["/[a]", "/[b]", "/[c]", "/[d]", "/[e]", "/[f]", "/[g]"];
    const result = explain("/x", routes);

    expect(result.nearMisses).toHaveLength(routes.length - 1);
  });

  it("E-05: every candidate carries a verdict", () => {
    const result = explain("/docs/a/b", ROUTES);

    expect(result.candidates).toHaveLength(ROUTES.length);
    for (const candidate of result.candidates) {
      if (candidate.matched) expect(candidate.reason).toBeUndefined();
      else expect(candidate.reason).toBeTruthy();
    }
    // The winner is derived from `winner.route`, not marked on the candidate.
    const winning = result.candidates.find((c) => c.route === result.winner?.route);
    expect(winning?.matched).toBe(true);
  });

  it("E-06: returns a null winner rather than throwing on no match", () => {
    const result = explain("/nothing/here", ["/w/[id]"]);

    expect(result.winner).toBeNull();
    expect(result.nearMisses).toEqual([]);
    expect(result.candidates.every((c) => !c.matched)).toBe(true);
  });

  it("E-07: reads sticky params from the href, not the bare pathname", () => {
    const result = explain("/workspaces/42?locale=fr&page=3", ROUTES, {
      stickyQuery: ["locale"],
    });

    expect(result.stickyQuery).toEqual({ locale: "fr" });
    // The query must not leak into matching.
    expect(result.winner?.route).toBe("/workspaces/[id]");
  });

  it("E-08: honours basePath when resolving", () => {
    const result = explain("/app/workspaces/42", ROUTES, { basePath: "/app" });

    expect(result.winner?.route).toBe("/workspaces/[id]");
  });
});

describe("explainPatternMatch — reject reasons", () => {
  const cases: Array<[string, string, string, string]> = [
    ["literal-mismatch", "/docs/about", "/docs/other", "static segment differs"],
    ["path-too-short", "/w", "/w/[id]/settings", "path runs out mid-pattern"],
    ["path-too-long", "/w/42/extra", "/w/[id]", "pattern runs out mid-path"],
    ["catch-all-empty", "/docs", "/docs/[...slug]", "catch-all needs one segment"],
    ["catch-all-not-last", "/a/b", "/[...rest]/tail", "catch-all is not final"],
  ];

  for (const [reason, path, pattern, why] of cases) {
    it(`E-reason: ${reason} — ${why}`, () => {
      const result = explainPatternMatch(path, pattern);

      expect(result.matched).toBe(false);
      if (!result.matched) {
        expect(result.reason).toBe(reason);
        expect(result.atSegment).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("E-09: still returns params on a match", () => {
    const result = explainPatternMatch("/w/42", "/w/[id]");

    expect(result.matched).toBe(true);
    if (result.matched) expect(result.params).toEqual({ id: "42" });
  });
});
