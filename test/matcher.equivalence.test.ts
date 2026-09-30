import { describe, expect, it } from "vitest";

import { matchPatternParams, matchRouteIn } from "../src/core/route-matcher";
import { createRouteState, type RouteState } from "../src/core/route-state";
import { normalizePath } from "../src/core/url";

/**
 * `matchRouteIn` answers from a compiled index (static lookup, depth filter)
 * instead of walking `state.ordered`. That shortcut is only allowed to be
 * faster, never different, so this pins it to the plain walk it replaced.
 *
 * Seeded, not random: the same sets and paths every run, so a failure here is
 * reproducible from the printed case alone.
 */

/** The matcher as it was before the index: first match in resolution order. */
function reference(state: RouteState, path: string) {
  const normalized = normalizePath(path, state.config);
  for (const route of state.ordered) {
    const params = matchPatternParams(normalized, route);
    if (params) return { route, params };
  }
  return null;
}

/** mulberry32 — tiny, seedable, good enough to spread cases around. */
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROUTE_SEGMENTS = ["a", "b", "c", "[x]", "[y]", "[...s]", "[[...s]]"];
const PATH_SEGMENTS = ["a", "b", "c", "d", "%20z"];

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function randomRoute(rand: () => number): string {
  const depth = Math.floor(rand() * 4);
  return (
    "/" + Array.from({ length: depth }, () => pick(rand, ROUTE_SEGMENTS)).join("/")
  );
}

function randomPath(rand: () => number): string {
  const depth = Math.floor(rand() * 5);
  return "/" + Array.from({ length: depth }, () => pick(rand, PATH_SEGMENTS)).join("/");
}

describe("compiled matcher equivalence", () => {
  it("agrees with the linear walk on 2,000 seeded route sets", () => {
    const rand = prng(20260930);
    let compared = 0;

    for (let set = 0; set < 2000; set++) {
      const routes = Array.from({ length: 1 + Math.floor(rand() * 8) }, () =>
        randomRoute(rand)
      );
      const state = createRouteState(routes);

      for (let probe = 0; probe < 12; probe++) {
        const path = randomPath(rand);
        const expected = reference(state, path);
        const actual = matchRouteIn(state, path);

        const got = actual && { route: actual.route, params: actual.params };
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
          // Print the case, not just the diff, so it can be pasted into a test.
          expect({ routes, path, got }).toEqual({ routes, path, got: expected });
        }
        compared++;
      }
    }

    expect(compared).toBe(24_000);
  });

  it("agrees with basePath and locales in play", () => {
    const state = createRouteState(["/w", "/w/[id]", "/docs/[...slug]"], {
      basePath: "/app",
      locales: ["en", "fr"],
    });

    for (const path of ["/app/fr/w/42", "/app/w", "/app/en/docs/a/b", "/app", "/x"]) {
      expect(matchRouteIn(state, path)).toEqual(reference(state, path));
    }
  });

  it("lets the first spelling of a static path win, as the walk did", () => {
    const state = createRouteState(["/a/", "/a"]);
    expect(matchRouteIn(state, "/a")?.route).toBe(reference(state, "/a")?.route);
  });

  it("still attaches meta on the static fast path", () => {
    const state = createRouteState(["/settings"], {
      meta: { "/settings": { title: "Settings" } },
    });
    expect(matchRouteIn(state, "/settings")?.meta).toEqual({ title: "Settings" });
  });
});
