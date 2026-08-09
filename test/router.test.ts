import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRouteTreeCache,
  createRouter,
  createSmartHistory,
  emitNavigation,
  getChildren,
  getDescendants,
  getParent,
  getRouteNode,
  getRouteTree,
  getSiblings,
  initializeSmartRouter,
  onBeforeNavigate,
  resetNavigationGuards,
  resetNavigationListeners,
  resetSmartRouter,
  runGuards,
  subscribeNavigation,
  validateRoutes,
} from "../src/index";

const ROUTES = [
  "/",
  "/w",
  "/w/[id]",
  "/w/[id]/members",
  "/w/[id]/settings",
  "/docs/[...slug]",
];

const META = {
  "/w": { title: "Workspaces" },
  "/w/[id]/settings": { title: "Settings", requiresAuth: true, roles: ["admin"] },
  "/w/[id]/members": { title: "Members", hidden: true },
};

beforeEach(() => {
  resetSmartRouter();
  resetNavigationListeners();
  resetNavigationGuards();
  clearRouteTreeCache();
  initializeSmartRouter({ routes: ROUTES, meta: META, force: true });
});

describe("createRouter", () => {
  it("is pure — two instances coexist without touching the global registry", () => {
    const a = createRouter(["/", "/alpha", "/alpha/[id]"]);
    const b = createRouter(["/", "/beta"]);

    expect(a.match("/alpha/1")?.route).toBe("/alpha/[id]");
    expect(b.match("/alpha/1")).toBeNull();
    expect(b.match("/beta")?.route).toBe("/beta");
  });

  it("applies basePath on the way in and out", () => {
    const router = createRouter(["/", "/w", "/w/[id]"], { basePath: "/app" });

    expect(router.match("/app/w/42")?.params).toEqual({ id: "42" });
    expect(router.build("/w/[id]", { id: 42 })).toBe("/app/w/42");
    expect(router.fsBack("/app/w/42")).toBe("/app/w");
    expect(router.nearestStatic("/app/w/42")).toBe("/app/w");
  });

  it("exposes meta on a match, for middleware protection", () => {
    const router = createRouter(ROUTES, { meta: META });
    const match = router.match("/w/42/settings");

    expect(match?.meta?.requiresAuth).toBe(true);
    expect(match?.meta?.roles).toEqual(["admin"]);
    expect(router.match("/w/42")?.meta).toBeUndefined();
  });

  it("carries sticky query params between two hrefs", () => {
    const router = createRouter(ROUTES, { stickyQuery: ["locale", /^utm_/] });

    expect(
      router.withSticky("/w/42?locale=fr&utm_source=x&page=3", "/w/42/members")
    ).toBe("/w/42/members?locale=fr&utm_source=x");
  });

  it("lets an explicit param on the target win over a carried one", () => {
    const router = createRouter(ROUTES, { stickyQuery: ["locale"] });
    expect(router.withSticky("/w?locale=fr", "/w/42?locale=de")).toBe(
      "/w/42?locale=de"
    );
  });

  it("builds breadcrumbs and active state from its own state", () => {
    const router = createRouter(ROUTES, { meta: META });

    expect(router.breadcrumbs("/w/42/settings").map((c) => c.label)).toEqual([
      "Workspaces",
      "42",
      "Settings",
    ]);
    expect(router.isActive("/w/42/settings", "/w")).toBe(true);
    expect(router.isActive("/w/42/settings", "/docs")).toBe(false);
  });
});

describe("validateRoutes", () => {
  it("flags a catch-all that is not final", () => {
    const conflicts = validateRoutes(["/", "/docs/[...slug]/edit"]);
    expect(conflicts).toContainEqual(
      expect.objectContaining({ kind: "catch-all-not-last", level: "error" })
    );
  });

  it("flags conflicting dynamic segment names at one level", () => {
    const conflicts = validateRoutes(["/", "/w/[id]", "/w/[workspaceId]"]);
    expect(conflicts).toContainEqual(
      expect.objectContaining({ kind: "param-name-mismatch" })
    );
  });

  it("flags duplicates", () => {
    expect(validateRoutes(["/a", "/a"])).toContainEqual(
      expect.objectContaining({ kind: "duplicate" })
    );
  });

  it("passes a clean manifest", () => {
    expect(validateRoutes(ROUTES)).toEqual([]);
  });
});

describe("route tree", () => {
  it("nests routes under their parents", () => {
    const tree = getRouteTree();
    expect(tree.path).toBe("/");

    const w = tree.children.find((c) => c.path === "/w");
    expect(w?.meta?.title).toBe("Workspaces");

    const id = w?.children.find((c) => c.path === "/w/[id]");
    expect(id?.dynamic).toBe(true);
    expect(id?.param).toBe("id");
    expect(id?.children.map((c) => c.path).sort()).toEqual([
      "/w/[id]/members",
      "/w/[id]/settings",
    ]);
  });

  it("creates pass-through nodes for folders with no page", () => {
    const node = getRouteNode("/docs");
    expect(node?.page).toBe(false);
    expect(node?.children.map((c) => c.path)).toEqual(["/docs/[...slug]"]);
  });

  it("lists children, hiding meta-hidden ones by default", () => {
    expect(getChildren("/w/[id]").map((c) => c.segment)).toEqual(["settings"]);
    expect(
      getChildren("/w/[id]", { includeHidden: true })
        .map((c) => c.segment)
        .sort()
    ).toEqual(["members", "settings"]);
  });

  it("omits pass-through folders from children unless asked", () => {
    expect(getChildren("/").map((c) => c.path)).toEqual(["/w"]);
    expect(
      getChildren("/", { includePassthrough: true })
        .map((c) => c.path)
        .sort()
    ).toEqual(["/docs", "/w"]);
  });

  it("resolves siblings, parents and descendants", () => {
    expect(
      getSiblings("/w/[id]/settings", { includeHidden: true }).map((c) => c.segment)
    ).toEqual(["members"]);
    expect(getParent("/w/[id]/settings")).toBe("/w/[id]");
    expect(getParent("/")).toBeNull();
    expect(
      getDescendants("/w")
        .map((c) => c.path)
        .sort()
    ).toEqual(["/w/[id]", "/w/[id]/members", "/w/[id]/settings"]);
  });
});

describe("navigation events", () => {
  it("reports the pattern, not the concrete URL", () => {
    const seen: string[] = [];
    subscribeNavigation((event) => seen.push(event.route ?? "?"));

    emitNavigation({
      type: "push",
      from: "/w",
      to: "/w/8fa2/settings",
      shallow: false,
    });
    emitNavigation({
      type: "push",
      from: "/w",
      to: "/w/c410/settings",
      shallow: false,
    });

    expect(seen).toEqual(["/w/[id]/settings", "/w/[id]/settings"]);
  });

  it("carries params and search", () => {
    const events: any[] = [];
    subscribeNavigation((event) => events.push(event));

    emitNavigation({
      type: "push",
      from: "/",
      to: "/w/42?tab=members",
      shallow: false,
    });

    expect(events[0].params).toEqual({ id: "42" });
    expect(events[0].search).toEqual({ tab: "members" });
  });

  it("survives a listener that throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();

    subscribeNavigation(() => {
      throw new Error("analytics is down");
    });
    subscribeNavigation(good);

    expect(() =>
      emitNavigation({ type: "push", from: "/", to: "/w", shallow: false })
    ).not.toThrow();
    expect(good).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("unsubscribes", () => {
    const listener = vi.fn();
    subscribeNavigation(listener)();
    emitNavigation({ type: "push", from: "/", to: "/w", shallow: false });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("navigation guards", () => {
  it("allows navigation when nothing cancels", async () => {
    onBeforeNavigate(() => {});
    await expect(runGuards({ from: "/a", to: "/b", type: "push" })).resolves.toBe(true);
  });

  it("blocks when a guard cancels", async () => {
    onBeforeNavigate(({ cancel }) => cancel());
    await expect(runGuards({ from: "/a", to: "/b", type: "push" })).resolves.toBe(
      false
    );
  });

  it("awaits async guards", async () => {
    onBeforeNavigate(async ({ cancel }) => {
      await Promise.resolve();
      cancel();
    });
    await expect(runGuards({ from: "/a", to: "/b", type: "push" })).resolves.toBe(
      false
    );
  });

  it("short-circuits after the first cancel", async () => {
    const second = vi.fn();
    onBeforeNavigate(({ cancel }) => cancel());
    onBeforeNavigate(second);

    await runGuards({ from: "/a", to: "/b", type: "push" });
    expect(second).not.toHaveBeenCalled();
  });
});

describe("SmartHistory", () => {
  it("keeps an isolated stack per instance", () => {
    const a = createSmartHistory({ initial: "/a" });
    const b = createSmartHistory({ initial: "/b" });

    a.push("/a/1");
    expect(a.current()).toBe("/a/1");
    expect(b.current()).toBe("/b");
  });

  it("tracks depth and back availability", () => {
    const history = createSmartHistory({ initial: "/" });
    expect(history.canGoBack()).toBe(false);

    history.push("/a");
    expect(history.canGoBack()).toBe(true);
    expect(history.back()).toBe("/");
    expect(history.canGoBack()).toBe(false);
  });

  it("caps the stack so a long session cannot leak", () => {
    const history = createSmartHistory({ initial: "/", maxLength: 3 });
    for (let i = 0; i < 10; i++) history.push(`/${i}`);

    expect(history.length).toBe(3);
    expect(history.entries()).toEqual(["/7", "/8", "/9"]);
  });

  it("notifies subscribers", () => {
    const history = createSmartHistory({ initial: "/" });
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);

    history.push("/a");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    history.push("/b");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
