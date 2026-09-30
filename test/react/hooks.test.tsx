// @vitest-environment happy-dom
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* -------------------------------------------------
 * next/navigation stand-in
 * ------------------------------------------------- */

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  // next/link consumes these itself; a bare <a> would warn about them.
  default: ({
    children,
    prefetch: _prefetch,
    replace: _replace,
    scroll: _scroll,
    ...props
  }: any) => <a {...props}>{children}</a>,
}));

import {
  initializeSmartRouter,
  onBeforeNavigate,
  parseAsEnum,
  parseAsInt,
  parseAsString,
  resetNavigationGuards,
  resetNavigationListeners,
  resetSmartRouter,
  subscribeNavigation,
  writeTransfer,
  clearTransfer,
} from "../../src/index";
import {
  SmartLink,
  useChildren,
  useFlash,
  useIsActive,
  useQueryState,
  useQueryStates,
  useRoute,
  useRouteState,
  useSmartRouter,
  SmartRouterDevtools,
} from "../../src/react";

const ROUTES = [
  "/",
  "/w",
  "/w/[id]",
  "/w/[id]/members",
  "/w/[id]/settings",
  "/docs/[...slug]",
];

function setLocation(href: string) {
  const [path, search = ""] = href.split("?");
  pathname = path;
  window.history.replaceState(null, "", search ? `${path}?${search}` : path);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSmartRouter();
  resetNavigationListeners();
  resetNavigationGuards();
  window.sessionStorage.clear();
  clearTransfer();
  setLocation("/w/42/settings");
  initializeSmartRouter({
    routes: ROUTES,
    meta: { "/w/[id]/settings": { title: "Settings" } },
    force: true,
  });
});

// Vitest is not running with `globals: true`, so RTL's automatic cleanup is
// never installed — without this, every mounted tree stays subscribed to
// window events and later tests render into a dirty React root.
afterEach(cleanup);

/* -------------------------------------------------
 * useSmartRouter
 * ------------------------------------------------- */

describe("useSmartRouter", () => {
  it("resolves relative targets", async () => {
    const { result } = renderHook(() => useSmartRouter());

    act(() => result.current.push("../members"));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(router.push).toHaveBeenCalledWith("/w/42/members", { scroll: undefined });
  });

  it("RX-02: forwards navigation options", async () => {
    const { result } = renderHook(() => useSmartRouter());

    act(() => result.current.push("../members", { scroll: false }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/w/42/members", { scroll: false })
    );
  });

  it("RX-01: is referentially stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useSmartRouter());
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
    expect(result.current.push).toBe(first.push);
  });

  it("walks up to the nearest existing route", async () => {
    const { result } = renderHook(() => useSmartRouter());

    act(() => result.current.fsBack());
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/w/42", { scroll: undefined })
    );
  });

  it("exposes a relative navigation vocabulary", async () => {
    const { result } = renderHook(() => useSmartRouter());

    act(() => result.current.sibling("members"));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/w/42/members", expect.anything())
    );

    act(() => result.current.up(2));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/w", expect.anything())
    );
  });

  it("checks a target against the manifest before navigating", async () => {
    const { result } = renderHook(() => useSmartRouter());

    expect(result.current.canNavigate("../members")).toBe(true);
    expect(result.current.canNavigate("../billing")).toBe(false);

    let navigated = false;
    act(() => {
      navigated = result.current.pushIfExists("../billing", { fallback: "../" });
    });

    expect(navigated).toBe(false);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/w/42", expect.anything())
    );
  });

  it("Q-05: carries sticky query params and drops screen-local ones", async () => {
    initializeSmartRouter({
      routes: ROUTES,
      stickyQuery: ["locale", /^utm_/],
      force: true,
    });
    setLocation("/w/42/settings?locale=fr&utm_source=x&page=3");

    const { result } = renderHook(() => useSmartRouter());
    act(() => result.current.push("../members"));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/w/42/members?locale=fr&utm_source=x",
        expect.anything()
      )
    );
  });

  it("Q-05: keeps repeated keys on the target while carrying sticky ones", async () => {
    initializeSmartRouter({ routes: ROUTES, stickyQuery: ["locale"], force: true });
    setLocation("/w/42/settings?locale=fr");

    const { result } = renderHook(() => useSmartRouter());
    act(() => result.current.push("../members?tag=a&tag=b"));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/w/42/members?locale=fr&tag=a&tag=b",
        expect.anything()
      )
    );
  });

  it("Q-05: keepQuery false opts out", async () => {
    initializeSmartRouter({ routes: ROUTES, stickyQuery: ["locale"], force: true });
    setLocation("/w/42/settings?locale=fr");

    const { result } = renderHook(() => useSmartRouter());
    act(() => result.current.push("../members", { keepQuery: false }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/w/42/members", expect.anything())
    );
  });

  it("X-01: hands state to the destination", async () => {
    const { result, unmount } = renderHook(() => useSmartRouter());
    act(() => result.current.push("/w", { state: { cart: [1] } }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    unmount();

    // Arrive on the destination, as the real navigation would.
    setLocation("/w");
    const { result: state } = renderHook(() => useRouteState<{ cart: number[] }>());
    expect(state.current).toEqual({ cart: [1] });
  });

  it("S-04: emits a navigation event carrying the pattern", async () => {
    const events: any[] = [];
    subscribeNavigation((event) => events.push(event));

    const { result } = renderHook(() => useSmartRouter());
    act(() => result.current.push("../members"));

    await waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      type: "push",
      route: "/w/[id]/members",
      params: { id: "42" },
    });
  });

  it("S-03: a guard can cancel the navigation", async () => {
    onBeforeNavigate(({ cancel }) => cancel());

    const { result } = renderHook(() => useSmartRouter());
    act(() => result.current.push("../members"));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(router.push).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------
 * useRoute / useIsActive
 * ------------------------------------------------- */

describe("useRoute", () => {
  it("returns the pattern, params, search, meta and breadcrumbs", () => {
    setLocation("/w/42/settings?tab=general");
    const { result } = renderHook(() => useRoute());

    expect(result.current.route).toBe("/w/[id]/settings");
    expect(result.current.params).toEqual({ id: "42" });
    expect(result.current.search).toEqual({ tab: "general" });
    expect(result.current.meta?.title).toBe("Settings");
    expect(result.current.breadcrumbs.map((c) => c.href)).toEqual([
      "/w",
      "/w/42",
      "/w/42/settings",
    ]);
  });

  it("FEAT-03: useIsActive is stable and pattern-aware", () => {
    const { result, rerender } = renderHook(() => useIsActive());
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);

    expect(result.current("/w")).toBe(true);
    expect(result.current("/w", { exact: true })).toBe(false);
    expect(result.current("/w/[id]")).toBe(true);
    expect(result.current("/docs")).toBe(false);
  });
});

/* -------------------------------------------------
 * Query state
 * ------------------------------------------------- */

describe("useQueryState", () => {
  it("reads a typed value with a default", () => {
    setLocation("/w?page=3");
    const { result } = renderHook(() => useQueryState("page", parseAsInt.default(1)));
    expect(result.current[0]).toBe(3);

    setLocation("/w");
    const { result: fallback } = renderHook(() =>
      useQueryState("page", parseAsInt.default(1))
    );
    expect(fallback.current[0]).toBe(1);
  });

  it("falls back to the default on unparseable input", () => {
    setLocation("/w?page=abc");
    const { result } = renderHook(() => useQueryState("page", parseAsInt.default(1)));
    expect(result.current[0]).toBe(1);
  });

  it("Q-03: writes shallowly without touching the router", async () => {
    setLocation("/w");
    const { result } = renderHook(() =>
      useQueryState("q", parseAsString.default(""), { shallow: true })
    );

    act(() => result.current[1]("hello"));
    await waitFor(() => expect(window.location.search).toBe("?q=hello"));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("writes through the router when not shallow", async () => {
    setLocation("/w");
    const { result } = renderHook(() => useQueryState("page", parseAsInt.default(1)));

    act(() => result.current[1](3));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/w?page=3", { scroll: false })
    );
  });

  it("Q-04: clearOnDefault removes the key", async () => {
    setLocation("/w?page=3");
    const { result } = renderHook(() =>
      useQueryState("page", parseAsInt.default(1).clearOnDefault(), { shallow: true })
    );

    act(() => result.current[1](1));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("Q-04: skips a write that would not change anything", async () => {
    setLocation("/w?page=3");
    const { result } = renderHook(() => useQueryState("page", parseAsInt.default(1)));

    act(() => result.current[1](3));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("accepts a functional updater", async () => {
    setLocation("/w?page=3");
    const { result } = renderHook(() =>
      useQueryState("page", parseAsInt.default(1), { shallow: true })
    );

    act(() => result.current[1]((previous) => previous + 1));
    await waitFor(() => expect(window.location.search).toBe("?page=4"));
  });
});

describe("useQueryStates", () => {
  it("Q-02: writes several keys in ONE navigation", async () => {
    setLocation("/w?tab=overview&page=7");

    const { result } = renderHook(() =>
      useQueryStates({
        tab: parseAsEnum(["overview", "members"]).default("overview"),
        page: parseAsInt.default(1),
      })
    );

    act(() => result.current[1]({ tab: "members", page: 1 }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith("/w?page=1&tab=members", {
      scroll: false,
    });
  });

  it("reads every key with its own parser", () => {
    setLocation("/w?tab=members&page=2");
    const { result } = renderHook(() =>
      useQueryStates({
        tab: parseAsEnum(["overview", "members"]).default("overview"),
        page: parseAsInt.default(1),
      })
    );

    expect(result.current[0]).toEqual({ tab: "members", page: 2 });
  });
});

/* -------------------------------------------------
 * Transfer & flash
 * ------------------------------------------------- */

describe("useRouteState", () => {
  it("X-03: reads the payload for the current URL", () => {
    setLocation("/w");
    writeTransfer("/w", { cart: [1, 2] });

    const { result } = renderHook(() => useRouteState<{ cart: number[] }>());
    expect(result.current).toEqual({ cart: [1, 2] });
  });

  it("X-03: is undefined on a cold entry", () => {
    setLocation("/w");
    const { result } = renderHook(() => useRouteState());
    expect(result.current).toBeUndefined();
  });
});

describe("useFlash", () => {
  it("X-04: consumes the message exactly once", async () => {
    const { writeFlash } = await import("../../src/index");
    writeFlash({ type: "success", message: "Saved" });

    const { result } = renderHook(() => useFlash());
    await waitFor(() => expect(result.current?.message).toBe("Saved"));

    const { result: second } = renderHook(() => useFlash());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(second.current).toBeUndefined();
  });
});

/* -------------------------------------------------
 * Route tree
 * ------------------------------------------------- */

describe("useChildren", () => {
  it("S-01: lists the current route's children for a nav menu", () => {
    setLocation("/w/42");
    const { result } = renderHook(() => useChildren("./"));

    expect(result.current.map((node) => node.segment).sort()).toEqual([
      "members",
      "settings",
    ]);
  });
});

/* -------------------------------------------------
 * SmartLink
 * ------------------------------------------------- */

describe("SmartLink", () => {
  it("FEAT-04: resolves a relative href in markup", () => {
    render(<SmartLink href="../members">Members</SmartLink>);
    expect(screen.getByText("Members")).toHaveProperty(
      "href",
      expect.stringContaining("/w/42/members")
    );
  });

  it("marks itself active and sets aria-current", () => {
    render(
      <SmartLink href="/w" activeClassName="on">
        Workspaces
      </SmartLink>
    );

    const anchor = screen.getByText("Workspaces");
    expect(anchor.className).toContain("on");
    expect(anchor.getAttribute("aria-current")).toBe("page");
  });

  it("is not active for an unrelated section", () => {
    render(
      <SmartLink href="/docs" activeClassName="on">
        Docs
      </SmartLink>
    );

    const anchor = screen.getByText("Docs");
    expect(anchor.className).not.toContain("on");
    expect(anchor.getAttribute("aria-current")).toBeNull();
  });

  it("Q-05: carries sticky query params", () => {
    initializeSmartRouter({ routes: ROUTES, stickyQuery: ["locale"], force: true });
    setLocation("/w/42/settings?locale=fr");

    render(<SmartLink href="../members">Members</SmartLink>);
    expect(screen.getByText("Members").getAttribute("href")).toBe(
      "/w/42/members?locale=fr"
    );
  });

  it("Q-05: keeps repeated keys on the href while carrying sticky ones", () => {
    initializeSmartRouter({ routes: ROUTES, stickyQuery: ["locale"], force: true });
    setLocation("/w/42/settings?locale=fr");

    render(<SmartLink href="../members?tag=a&tag=b">Members</SmartLink>);
    expect(screen.getByText("Members").getAttribute("href")).toBe(
      "/w/42/members?locale=fr&tag=a&tag=b"
    );
  });
});

/* -------------------------------------------------
 * SmartRouterDevtools
 *
 * REGRESSION PIN. The overlay computes its near-miss list and its
 * "rank N/total" inline today. Both are about to move behind explainIn().
 * These tests describe the CURRENT rendered output so the refactor cannot
 * change it silently.
 * ------------------------------------------------- */

describe("SmartRouterDevtools", () => {
  // Overlapping patterns, so there is a real near miss to pin. The repo-wide
  // ROUTES fixture has none at any path.
  const OVERLAPPING = ["/", "/w/[id]", "/w/[id]/[tab]", "/w/[id]/settings"];

  beforeEach(() => {
    initializeSmartRouter({ routes: OVERLAPPING, force: true });
    setLocation("/w/42/settings");
  });

  it("D-01: reports the matched route with its rank out of the ordered total", () => {
    render(<SmartRouterDevtools defaultOpen />);

    // Specificity order is: / , /w/[id] , /w/[id]/settings , /w/[id]/[tab]
    // so the static-tail winner sits third of four.
    //
    // The label reads "nsr rank", not "rank", on purpose: this ordering is the
    // library's own and it does NOT match Next's, which groups by trie branch.
    // Saying whose rank it is costs nothing and stops the number being read as
    // a claim about the framework.
    expect(screen.getByText(/\/w\/\[id\]\/settings\s+\(nsr rank 3\/4\)/)).toBeTruthy();
  });

  it("D-02: lists the patterns that also matched but lost", () => {
    render(<SmartRouterDevtools defaultOpen />);

    expect(screen.getByText("also matched")).toBeTruthy();
    expect(screen.getByText("/w/[id]/[tab]")).toBeTruthy();
  });

  it("D-03: shows no near-miss row when nothing else matched", () => {
    initializeSmartRouter({ routes: ["/", "/w/[id]/settings"], force: true });
    render(<SmartRouterDevtools defaultOpen />);

    expect(screen.queryByText("also matched")).toBeNull();
  });

  it("D-04: renders an em dash for a path no route matches", () => {
    setLocation("/nothing/here");
    render(<SmartRouterDevtools defaultOpen />);

    expect(screen.getByText("no match")).toBeTruthy();
  });
});
