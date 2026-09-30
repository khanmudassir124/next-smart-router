import { warnIfUninitialized } from "./dev-warn";
import { getRouteState } from "./route-registry";
import { toSegments } from "./segments";
import type { RouteState } from "./route-state";
import { localeOf, normalizePath, toUrlPath, withLocale } from "./url";

export interface NearestStaticRouteOptions {
  /**
   * Whether `pathname` itself may be returned when it is already a static
   * route. Default `true` — pass `false` to force a strict ancestor.
   */
  includeSelf?: boolean;
}

/**
 * Return the nearest ancestor of `pathname` that is a fully *static* route
 * (contains no dynamic segments). Useful when redirecting across domains where
 * dynamic params from the current path would not be valid.
 *
 * Falls back to "/". Returns a full URL path, like {@link fsBackPathSafe}.
 */
export function getNearestStaticRoute(
  pathname: string,
  options: NearestStaticRouteOptions = {}
): string {
  warnIfUninitialized("getNearestStaticRoute");
  const state = getRouteState();
  return toUrlPath(nearestStaticIn(state, pathname, options), state.config);
}

/** {@link getNearestStaticRoute} as a Next-relative href, against an explicit state. */
export function nearestStaticIn(
  state: RouteState,
  pathname: string,
  options: NearestStaticRouteOptions = {}
): string {
  const locale = localeOf(pathname, state.config);
  const parts = toSegments(normalizePath(pathname, state.config));

  if (options.includeSelf === false) parts.pop();

  while (parts.length > 0) {
    const candidate = "/" + parts.join("/");
    if (state.staticRoutes.includes(candidate)) return withLocale(candidate, locale);
    parts.pop();
  }

  return withLocale("/", locale);
}
