/**
 * The default (global) route state.
 *
 * Routes are Next.js App Router path patterns, e.g.
 *   "/", "/workspaces", "/workspaces/[id]", "/docs/[...slug]"
 *
 * The registry starts with only the root route ("/") and is populated by the
 * consumer app via {@link initializeSmartRouter}, usually with a manifest
 * produced by the `next-smart-router generate` CLI.
 *
 * Prefer `createRouter()` when you need an instance that is not global —
 * middleware, tests, or anything running more than one route set per process.
 */

import { getConfig } from "./config";
import {
  createRouteState,
  hasUserRoutes,
  type RouteMetaMap,
  type RouteState,
} from "./route-state";

let state: RouteState = createRouteState();

/**
 * Replace the set of known routes. Always keeps "/" present, and re-derives
 * the specificity ordering used by every matcher.
 */
export function setRoutes(routes: Iterable<string>, meta?: RouteMetaMap): void {
  state = createRouteState(routes, { ...getConfig(), meta: meta ?? state.meta });
}

/** Attach or replace route metadata without touching the route set. */
export function setRouteMeta(meta: RouteMetaMap): void {
  state = { ...state, meta };
}

/** Re-derive the default state from the current global config. */
export function refreshRouteState(): void {
  state = createRouteState(state.routes, { ...getConfig(), meta: state.meta });
}

/** The current set of known routes. */
export function getRoutes(): Set<string> {
  return state.routes;
}

/** Known routes in Next.js resolution order, most specific first. */
export function getOrderedRoutes(): readonly string[] {
  return state.ordered;
}

/** Known routes containing no dynamic segment, in resolution order. */
export function getStaticRoutes(): readonly string[] {
  return state.staticRoutes;
}

/** All registered route metadata. */
export function getRouteMetaMap(): RouteMetaMap {
  return state.meta;
}

/** The full default route state, for functions that take one explicitly. */
export function getRouteState(): RouteState {
  return state;
}

/** Whether any routes beyond the implicit root have been registered. */
export function hasRoutes(): boolean {
  return hasUserRoutes(state);
}

/** Reset back to the implicit root route only. Intended for tests. */
export function clearRoutes(): void {
  state = createRouteState([], { ...getConfig() });
}
