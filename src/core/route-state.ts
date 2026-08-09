/**
 * The immutable, pre-computed view of an app's routes that every matcher reads.
 *
 * Building it once — rather than filtering and sorting on each call — is what
 * makes Next.js resolution order (static > dynamic > catch-all > optional
 * catch-all) cheap enough to apply everywhere.
 */

import { compareSpecificity, isStaticRoute, toSegments } from "./segments";
import {
  DEFAULT_CONFIG,
  resolveConfig,
  type SmartRouterConfig,
  type SmartRouterConfigInput,
} from "./config";

/** User-supplied metadata for a route, produced by `route.meta.ts` sidecars. */
export interface RouteMeta {
  title?: string;
  icon?: string;
  hidden?: boolean;
  requiresAuth?: boolean;
  roles?: readonly string[];
  [key: string]: unknown;
}

export type RouteMetaMap = Record<string, RouteMeta>;

export interface RouteState {
  /** Every known route pattern, including "/". */
  routes: Set<string>;
  /** All routes in Next.js resolution order, most specific first. */
  ordered: readonly string[];
  /** Routes containing no dynamic segment, in resolution order. */
  staticRoutes: readonly string[];
  /** Per-route metadata, keyed by pattern. */
  meta: RouteMetaMap;
  config: SmartRouterConfig;
}

export interface CreateRouteStateOptions extends SmartRouterConfigInput {
  meta?: RouteMetaMap;
}

export function createRouteState(
  routes: Iterable<string> = [],
  options: CreateRouteStateOptions = {}
): RouteState {
  const { meta = {}, ...configInput } = options;
  const set = new Set(["/", ...routes]);
  const ordered = [...set].sort(compareSpecificity);

  return {
    routes: set,
    ordered,
    staticRoutes: ordered.filter(isStaticRoute),
    meta,
    config: resolveConfig(configInput, DEFAULT_CONFIG),
  };
}

/** A route state carrying only the root route. */
export const EMPTY_ROUTE_STATE: RouteState = createRouteState();

/** Whether any route beyond the implicit root is registered. */
export function hasUserRoutes(state: RouteState): boolean {
  return state.routes.size > 1;
}

/** Number of path segments in a route pattern. */
export function routeDepth(route: string): number {
  return toSegments(route).length;
}
