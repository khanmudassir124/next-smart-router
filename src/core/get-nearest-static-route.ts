import { warnIfUninitialized } from "./dev-warn";
import { getRouteState } from "./route-registry";
import { toSegments } from "./segments";
import { applyBasePath, normalizePath } from "./url";

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
 * Falls back to "/".
 */
export function getNearestStaticRoute(
  pathname: string,
  options: NearestStaticRouteOptions = {}
): string {
  warnIfUninitialized("getNearestStaticRoute");

  const state = getRouteState();
  const staticRoutes = state.staticRoutes;
  const parts = toSegments(normalizePath(pathname, state.config));

  if (options.includeSelf === false) parts.pop();

  while (parts.length > 0) {
    const candidate = "/" + parts.join("/");
    if (staticRoutes.includes(candidate)) {
      return applyBasePath(candidate, state.config.basePath);
    }
    parts.pop();
  }

  return applyBasePath("/", state.config.basePath);
}
