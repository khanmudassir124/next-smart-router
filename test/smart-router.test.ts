import { beforeEach, describe, expect, it } from "vitest";
import {
  initializeSmartRouter,
  resetSmartRouter,
  getRoutes,
  matchRoute,
  matchRoutePattern,
  resolvePath,
  getParams,
  getBreadcrumbs,
  fsBackPathSafe,
  getNearestStaticRoute,
} from "../src/index";

const ROUTES = new Set<string>([
  "/",
  "/workspaces",
  "/workspaces/[id]",
  "/workspaces/[id]/settings",
  "/docs/[...slug]",
  "/files/[[...path]]",
]);

beforeEach(() => {
  resetSmartRouter();
  // `force` proves routes registered at runtime ARE visible — the original
  // captured routes at module-load time and never saw them.
  initializeSmartRouter({ routes: ROUTES, force: true });
});

describe("route registry", () => {
  it("registers routes and always keeps root", () => {
    expect(getRoutes().has("/")).toBe(true);
    expect(getRoutes().has("/workspaces/[id]")).toBe(true);
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
});

describe("matchRoute against registry", () => {
  it("matches known dynamic routes", () => {
    expect(matchRoute("/workspaces/42/settings")).toBe(true);
    expect(matchRoute("/nope/123")).toBe(false);
  });
});

describe("resolvePath", () => {
  it("resolves relative and absolute targets", () => {
    expect(resolvePath("/a/b/c", "../x")).toBe("/a/b/x");
    expect(resolvePath("/a/b/c", "./x")).toBe("/a/b/c/x");
    expect(resolvePath("/a/b/c", "/x")).toBe("/x");
    expect(resolvePath("/a/b/c", "../../x")).toBe("/a/x");
  });
});

describe("getParams", () => {
  it("extracts a dynamic param", () => {
    const p = getParams<["id"]>({ pathname: "/workspaces/42" });
    expect(p.id).toBe("42");
  });
  it("extracts catch-all params as arrays", () => {
    const p = getParams<["slug"]>({ pathname: "/docs/a/b/c" });
    expect(p.slug).toEqual(["a", "b", "c"]);
  });
  it("coerces and asserts", () => {
    const p = getParams<["id"], { id: number }>({
      pathname: "/workspaces/42",
      coerce: { id: (v) => Number(v) },
      assert: ["id"],
    });
    expect(p.id).toBe(42);
  });
  it("returns empty object for unmatched path", () => {
    expect(getParams({ pathname: "/totally/unknown/deep" })).toEqual({});
  });
});

describe("getBreadcrumbs", () => {
  it("includes only matchable ancestors", () => {
    expect(getBreadcrumbs("/workspaces/42/settings")).toEqual([
      { label: "workspaces", href: "/workspaces" },
      { label: "42", href: "/workspaces/42" },
      { label: "settings", href: "/workspaces/42/settings" },
    ]);
  });
});

describe("fsBackPathSafe", () => {
  it("walks up to the nearest known route", () => {
    expect(fsBackPathSafe("/workspaces/42/settings")).toBe("/workspaces/42");
    expect(fsBackPathSafe("/workspaces")).toBe("/");
  });
});

describe("getNearestStaticRoute", () => {
  it("skips dynamic ancestors", () => {
    expect(getNearestStaticRoute("/workspaces/42/settings")).toBe(
      "/workspaces"
    );
    expect(getNearestStaticRoute("/unknown")).toBe("/");
  });
});
