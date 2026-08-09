/**
 * Navigation events.
 *
 * The App Router removed `router.events` and never replaced it, so page-view
 * analytics are usually an effect on `usePathname()` — which produces one row
 * per concrete URL. Since the registry knows the pattern, events carry it:
 * `/w/[id]/settings` instead of ten thousand distinct workspace URLs.
 */

import { matchRoute, type RouteParams } from "./route-matcher";
import { parseQuery, type ParsedQuery } from "./url";

export type NavigationType =
  "push" | "replace" | "back" | "forward" | "fsBack" | "query";

export interface NavigationEvent {
  type: NavigationType;
  /** The URL navigated away from. */
  from: string;
  /** The URL navigated to. */
  to: string;
  /** The matched route pattern for `to`, e.g. "/w/[id]/settings". */
  route: string | null;
  params: RouteParams;
  search: ParsedQuery;
  /** Whether this update skipped the server round-trip. */
  shallow: boolean;
}

export type NavigationListener = (event: NavigationEvent) => void;

const listeners = new Set<NavigationListener>();

/**
 * Subscribe to navigations performed through this package.
 *
 * @example
 * subscribeNavigation((e) => analytics.page(e.route, { ...e.params, ...e.search }));
 */
export function subscribeNavigation(listener: NavigationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emit a navigation event. Called by the router hooks; rarely called directly. */
export function emitNavigation(
  event: Omit<NavigationEvent, "route" | "params" | "search"> &
    Partial<Pick<NavigationEvent, "route" | "params" | "search">>
): void {
  if (listeners.size === 0) return;

  const match = event.route === undefined ? matchRoute(event.to) : null;

  const full: NavigationEvent = {
    ...event,
    route: event.route ?? match?.route ?? null,
    params: event.params ?? match?.params ?? {},
    search: event.search ?? parseQuery(event.to),
  };

  for (const listener of listeners) {
    try {
      listener(full);
    } catch (error) {
      // A broken analytics listener must never break navigation.

      console.error("next-smart-router: navigation listener threw", error);
    }
  }
}

/** Remove every listener. Intended for tests. */
export function resetNavigationListeners(): void {
  listeners.clear();
}

/* -------------------------------------------------
 * Guards
 * ------------------------------------------------- */

export interface NavigationGuardContext {
  from: string;
  to: string;
  type: NavigationType;
  /** Call to block the navigation. */
  cancel: () => void;
}

export type NavigationGuard = (context: NavigationGuardContext) => void | Promise<void>;

const guards = new Set<NavigationGuard>();

/**
 * Register a guard that can block navigations performed through this package.
 *
 * Coverage, stated plainly: `push` / `replace` / `fsBack` and `<SmartLink>`
 * clicks are fully interceptable. Hard navigations and tab close are covered
 * by `beforeunload` (browser-styled prompt, no custom message). The browser
 * back button needs `interceptBrowserBack`, which is off by default.
 */
export function onBeforeNavigate(guard: NavigationGuard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

/** Whether any guard is currently registered. */
export function hasGuards(): boolean {
  return guards.size > 0;
}

/** Run every guard; resolves `false` when any of them cancelled. */
export async function runGuards(
  context: Omit<NavigationGuardContext, "cancel">
): Promise<boolean> {
  if (guards.size === 0) return true;

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };

  for (const guard of guards) {
    await guard({ ...context, cancel });
    if (cancelled) return false;
  }
  return true;
}

/** Remove every guard. Intended for tests. */
export function resetNavigationGuards(): void {
  guards.clear();
}
