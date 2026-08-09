"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Event dispatched after a shallow (History API) URL update, so hooks reading
 * `window.location.search` re-render. `popstate` alone is not enough —
 * `history.replaceState` does not fire it.
 */
export const LOCATION_EVENT = "nsr:locationchange";

const SUBSCRIBED_EVENTS = ["popstate", "hashchange", LOCATION_EVENT] as const;

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  for (const event of SUBSCRIBED_EVENTS) {
    window.addEventListener(event, onChange);
  }
  return () => {
    for (const event of SUBSCRIBED_EVENTS) {
      window.removeEventListener(event, onChange);
    }
  };
}

/** Notify subscribers that the URL changed without a router navigation. */
export function notifyLocationChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

/**
 * Apply a URL change through the History API, bypassing the router.
 *
 * This is the fast path behind `{ shallow: true }`: the address bar updates
 * and subscribed hooks re-render, but the Server Component tree is not
 * re-fetched. Only correct when nothing on the server reads the changed param.
 */
export function applyShallowUrl(url: string, mode: "push" | "replace"): void {
  if (typeof window === "undefined") return;

  if (mode === "push") window.history.pushState(window.history.state, "", url);
  else window.history.replaceState(window.history.state, "", url);

  notifyLocationChange();
}

/**
 * The current query string (without "?"), updating on both router navigations
 * and shallow History API writes.
 *
 * Next's `useSearchParams()` supplies the server snapshot, which keeps the
 * first client render identical to the server's and avoids a hydration
 * mismatch; after mount the live `window.location` takes over so shallow
 * updates are visible.
 */
export function useLocationSearch(): string {
  const fromRouter = useSearchParams();
  const serverSnapshot = fromRouter?.toString() ?? "";

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return serverSnapshot;
    return window.location.search.replace(/^\?/, "");
  }, [serverSnapshot]);

  const getServerSnapshot = useCallback(() => serverSnapshot, [serverSnapshot]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The current query string, read only from the browser.
 *
 * Deliberately does *not* touch `useSearchParams()`. Doing so opts a page into
 * Next's client-side-rendering bailout, which fails a static prerender unless
 * the tree is wrapped in `<Suspense>`. Hooks whose value is `undefined` on the
 * server by contract — the transfer hooks — have nothing to gain from the
 * router's snapshot and should not impose that cost on their callers.
 *
 * The trade-off is an empty first (hydration) render, which is correct for
 * those hooks and is what `useSyncExternalStore` is designed for.
 */
export function useClientLocationSearch(): string {
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return "";
    return window.location.search.replace(/^\?/, "");
  }, []);

  const getServerSnapshot = useCallback(() => "", []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The full current URL (path + query + hash), SSR-safe. */
export function useLocationHref(pathname: string): string {
  const search = useLocationSearch();
  return search ? `${pathname}?${search}` : pathname;
}
