import { beforeEach, describe, expect, it } from "vitest";
import {
  buildHref,
  compareSpecificity,
  fsBackPathSafe,
  getBreadcrumbs,
  getNearestStaticRoute,
  getOrderedRoutes,
  getParams,
  getRoutes,
  initializeSmartRouter,
  isActive,
  matchRoute,
  matchRoutePattern,
  resetSmartRouter,
  resolvePath,
  routeExists,
  safeDecode,
  SmartRouterHrefError,
  SmartRouterParamError,
  tryBuildHref,
} from "../src/index";

const ROUTES = [
  "/",
  "/workspaces",
  "/workspaces/[id]",
  "/workspaces/[id]/settings",
  "/docs/about",
  "/docs/[...slug]",
  "/files/[[...path]]",
];

beforeEach(() => {
  resetSmartRouter();
  initializeSmartRouter({ routes: ROUTES, force: true });
});

describe("route registry", () => {
  it("registers routes and always keeps root", () => {
    expect(getRoutes().has("/")).toBe(true);
    expect(getRoutes().has("/workspaces/[id]")).toBe(true);
  });

  it("BUG-08: reset clears routes, not just the flag", () => {
    resetSmartRouter();
    expect([...getRoutes()]).toEqual(["/"]);
  });

  it("BUG-01: orders routes by Next.js specificity, not lexically", () => {
    const ordered = getOrderedRoutes();
    expect(ordered.indexOf("/docs/about")).toBeLessThan(
      ordered.indexOf("/docs/[...slug]")
    );
    expect(ordered.indexOf("/workspaces/[id]")).toBeLessThan(
      ordered.indexOf("/docs/[...slug]")
    );
  });

  it("ranks static > dynamic > catch-all > optional catch-all", () => {
    expect(compareSpecificity("/a/b", "/a/[b]")).toBeLessThan(0);
    expect(compareSpecificity("/a/[b]", "/a/[...b]")).toBeLessThan(0);
    expect(compareSpecificity("/a/[...b]", "/a/[[...b]]")).toBeLessThan(0);
  });
});

describe("matchRoutePattern", () => {
  it("matches static and dynamic segments", () => {
    expect(matchRoutePattern("/workspaces/42", "/workspaces/[id]")).toBe(true);
    expect(matchRoutePattern("/workspaces", "/workspaces/[id]")).toBe(false);
  });

  it("handles catch-all (one or more)", () => {
    expect(matchRoutePattern("/docs/a/b/c", "/docs/[...slug]")).toBe(true);
    expect(matchRoutePattern("/docs", "/docs/[...slug]")).toBe(false);
  });

  it("handles optional catch-all (zero or more)", () => {
    expect(matchRoutePattern("/files", "/files/[[...path]]")).toBe(true);
    expect(matchRoutePattern("/files/a/b", "/files/[[...path]]")).toBe(true);
  });

  it("rejects a catch-all that is not the final segment", () => {
    expect(matchRoutePattern("/docs/a/edit", "/docs/[...slug]/edit")).toBe(false);
  });

  it("BUG-07: ignores query strings and hashes", () => {
    expect(matchRoutePattern("/workspaces?tab=1", "/workspaces")).toBe(true);
    expect(matchRoutePattern("/workspaces#top", "/workspaces")).toBe(true);
  });
});

describe("matchRoute", () => {
  it("returns the matched pattern and params", () => {
    expect(matchRoute("/workspaces/42/settings")).toEqual({
      route: "/workspaces/[id]/settings",
      params: { id: "42" },
    });
  });

  it("returns null for an unknown path", () => {
    expect(matchRoute("/nope/123")).toBeNull();
    expect(routeExists("/nope/123")).toBe(false);
  });

  it("BUG-01: a static route wins over a catch-all sibling", () => {
    expect(matchRoute("/docs/about")?.route).toBe("/docs/about");
    expect(matchRoute("/docs/other")?.route).toBe("/docs/[...slug]");
  });

  it("BUG-07: matches a path carrying a query string", () => {
    expect(matchRoute("/workspaces?tab=1")?.route).toBe("/workspaces");
    expect(matchRoute("/workspaces/42?tab=1")?.params).toEqual({ id: "42" });
  });
});

describe("resolvePath", () => {
  it("resolves relative and absolute targets", () => {
    expect(resolvePath("/a/b/c", "../x")).toBe("/a/b/x");
    expect(resolvePath("/a/b/c", "./x")).toBe("/a/b/c/x");
    expect(resolvePath("/a/b/c", "/x")).toBe("/x");
    expect(resolvePath("/a/b/c", "../../x")).toBe("/a/x");
  });

  it("clamps at the root instead of producing leading ..", () => {
    expect(resolvePath("/a", "../../../x")).toBe("/x");
  });

  it("BUG-06: drops the current query when the path changes", () => {
    expect(resolvePath("/a/b?q=1", "./x")).toBe("/a/b/x");
  });

  it("BUG-06: carries the target's own query and hash", () => {
    expect(resolvePath("/a/b/c", "../x?q=1")).toBe("/a/b/x?q=1");
    expect(resolvePath("/a/b/c", "../x#top")).toBe("/a/b/x#top");
    expect(resolvePath("/a/b/c", "/x?q=1#top")).toBe("/x?q=1#top");
  });

  it("BUG-06: a query- or hash-only target keeps the current path", () => {
    expect(resolvePath("/a/b", "?q=1")).toBe("/a/b?q=1");
    expect(resolvePath("/a/b", "#top")).toBe("/a/b#top");
    expect(resolvePath("/a/b?old=1", "?q=1")).toBe("/a/b?q=1");
  });
});

describe("getParams", () => {
  it("extracts a dynamic param", () => {
    expect(getParams<["id"]>({ pathname: "/workspaces/42" }).id).toBe("42");
  });

  it("extracts catch-all params as arrays", () => {
    expect(getParams<["slug"]>({ pathname: "/docs/a/b/c" }).slug).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("coerces and asserts", () => {
    const params = getParams<["id"], { id: number }>({
      pathname: "/workspaces/42",
      coerce: { id: (v) => Number(v) },
      assert: ["id"],
    });
    expect(params.id).toBe(42);
  });

  it("throws on a missing asserted param", () => {
    expect(() => getParams({ pathname: "/workspaces", assert: ["id"] })).toThrow(
      SmartRouterParamError
    );
  });

  it("returns an empty object for an unmatched path", () => {
    expect(getParams({ pathname: "/totally/unknown/deep" })).toEqual({});
  });

  it("BUG-01: does not let a catch-all swallow a static sibling", () => {
    expect(getParams({ pathname: "/docs/about" })).toEqual({});
  });

  it("BUG-02: an empty optional catch-all is undefined, not []", () => {
    expect(getParams({ pathname: "/files" })).toEqual({ path: undefined });
    expect(getParams({ pathname: "/files/a/b" })).toEqual({ path: ["a", "b"] });
  });

  it("BUG-03: decodes catch-all segments", () => {
    expect(getParams({ pathname: "/docs/a%20b/c" })).toEqual({
      slug: ["a b", "c"],
    });
  });

  it("BUG-04: degrades instead of throwing on a malformed escape", () => {
    expect(() => getParams({ pathname: "/workspaces/%E0%A4%A" })).not.toThrow();
    expect(getParams({ pathname: "/workspaces/%E0%A4%A" })).toEqual({
      id: "%E0%A4%A",
    });
  });

  it("takes a route pattern for typed params", () => {
    const params = getParams("/workspaces/[id]", { pathname: "/workspaces/42" });
    expect(params).toEqual({ id: "42" });
  });

  it("validates with a Standard Schema", () => {
    const schema = {
      "~standard": {
        validate: (value: any) =>
          /^\d+$/.test(value.id)
            ? { value: { id: Number(value.id) } }
            : { issues: [{ message: "id must be numeric" }] },
      },
    };

    expect(
      getParams("/workspaces/[id]", { pathname: "/workspaces/42", schema })
    ).toEqual({ id: 42 });

    expect(() =>
      getParams("/workspaces/[id]", { pathname: "/workspaces/abc", schema })
    ).toThrow(/id must be numeric/);
  });
});

describe("getBreadcrumbs", () => {
  it("includes only matchable ancestors", () => {
    expect(getBreadcrumbs("/workspaces/42/settings").map((c) => c.href)).toEqual([
      "/workspaces",
      "/workspaces/42",
      "/workspaces/42/settings",
    ]);
  });

  it("reports the matched pattern, param and current flag", () => {
    const crumbs = getBreadcrumbs("/workspaces/42/settings");
    expect(crumbs[1]).toMatchObject({
      label: "42",
      pattern: "/workspaces/[id]",
      param: "id",
      isCurrent: false,
    });
    expect(crumbs[2].isCurrent).toBe(true);
  });

  it("BUG-05: decodes labels", () => {
    expect(getBreadcrumbs("/workspaces/hello%20world")[1].label).toBe("hello world");
  });

  it("applies label overrides, formatting and a root crumb", () => {
    const crumbs = getBreadcrumbs("/workspaces/42/settings", {
      labels: { "/workspaces": "Workspaces", "42": "Acme Inc" },
      format: "title",
      includeRoot: true,
      rootLabel: "Home",
    });
    expect(crumbs.map((c) => c.label)).toEqual([
      "Home",
      "Workspaces",
      "Acme Inc",
      "Settings",
    ]);
  });

  it("keeps unmatched ancestors as text when asked", () => {
    initializeSmartRouter({ routes: ["/", "/a/b"], force: true });
    const crumbs = getBreadcrumbs("/a/b", { unmatched: "text" });
    expect(crumbs.map((c) => [c.segment, c.matched])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });
});

describe("fsBackPathSafe", () => {
  it("walks up to the nearest known route", () => {
    expect(fsBackPathSafe("/workspaces/42/settings")).toBe("/workspaces/42");
    expect(fsBackPathSafe("/workspaces")).toBe("/");
  });

  it("skips missing intermediate routes", () => {
    initializeSmartRouter({ routes: ["/", "/a", "/a/b/c"], force: true });
    expect(fsBackPathSafe("/a/b/c")).toBe("/a");
  });

  it("takes multiple levels", () => {
    expect(fsBackPathSafe("/workspaces/42/settings", { levels: 2 })).toBe(
      "/workspaces"
    );
  });

  it("BUG-07: ignores a query string on the input", () => {
    expect(fsBackPathSafe("/workspaces/42/settings?tab=1")).toBe("/workspaces/42");
  });
});

describe("getNearestStaticRoute", () => {
  it("skips dynamic ancestors", () => {
    expect(getNearestStaticRoute("/workspaces/42/settings")).toBe("/workspaces");
    expect(getNearestStaticRoute("/unknown")).toBe("/");
  });

  it("returns itself for a static path by default", () => {
    expect(getNearestStaticRoute("/workspaces")).toBe("/workspaces");
  });

  it("can be forced to a strict ancestor", () => {
    expect(getNearestStaticRoute("/workspaces", { includeSelf: false })).toBe("/");
  });
});

describe("buildHref", () => {
  it("fills dynamic and catch-all segments", () => {
    expect(buildHref("/workspaces/[id]", { id: 42 })).toBe("/workspaces/42");
    expect(buildHref("/docs/[...slug]", { slug: ["a", "b"] })).toBe("/docs/a/b");
  });

  it("encodes every segment", () => {
    expect(buildHref("/docs/[...slug]", { slug: ["a b", "c/d"] })).toBe(
      "/docs/a%20b/c%2Fd"
    );
    expect(buildHref("/workspaces/[id]", { id: "a?b#c" })).toBe(
      "/workspaces/a%3Fb%23c"
    );
  });

  it("omits an empty optional catch-all", () => {
    expect(buildHref("/files/[[...path]]", {})).toBe("/files");
    expect(buildHref("/files/[[...path]]", { path: ["a"] })).toBe("/files/a");
  });

  it("appends query and hash", () => {
    expect(
      buildHref(
        "/workspaces/[id]",
        { id: 7 },
        { query: { tab: "members" }, hash: "top" }
      )
    ).toBe("/workspaces/7?tab=members#top");
    expect(buildHref("/workspaces", {}, { query: { a: 1, b: undefined } })).toBe(
      "/workspaces?a=1"
    );
  });

  it("throws on a missing required param", () => {
    expect(() => buildHref("/workspaces/[id]", {} as any)).toThrow(
      SmartRouterHrefError
    );
    expect(() => buildHref("/docs/[...slug]", { slug: [] })).toThrow(
      SmartRouterHrefError
    );
    expect(tryBuildHref("/workspaces/[id]", {} as any)).toBeNull();
  });
});

describe("isActive", () => {
  it("matches the exact path and its descendants", () => {
    expect(isActive("/workspaces/42/settings", "/workspaces")).toBe(true);
    expect(isActive("/workspaces/42/settings", "/workspaces", { exact: true })).toBe(
      false
    );
    expect(isActive("/workspaces", "/workspaces", { exact: true })).toBe(true);
  });

  it("does not treat a shared prefix as a parent", () => {
    expect(isActive("/workspaces-archive", "/workspaces")).toBe(false);
  });

  it("accepts a route pattern", () => {
    expect(isActive("/workspaces/42/settings", "/workspaces/[id]")).toBe(true);
    expect(
      isActive("/workspaces/42/settings", "/workspaces/[id]", { exact: true })
    ).toBe(false);
    expect(isActive("/docs/a", "/workspaces/[id]")).toBe(false);
  });

  it("never lights up the root for every path", () => {
    expect(isActive("/workspaces", "/")).toBe(false);
    expect(isActive("/", "/")).toBe(true);
  });
});

describe("safeDecode", () => {
  it("decodes valid input and passes malformed input through", () => {
    expect(safeDecode("a%20b")).toBe("a b");
    expect(safeDecode("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
