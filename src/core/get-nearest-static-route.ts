import { getRoutes } from "./route-registry";
import { toSegments } from "./segments";

/**
 * Return the nearest ancestor of `pathname` that is a fully *static* route
 * (contains no dynamic segments). Useful when redirecting across domains where
 * dynamic params from the current path would not be valid.
 *
 * Falls back to "/".
 */
export function getNearestStaticRoute(pathname: string): string {
  const staticRoutes = [...getRoutes()].filter((route) => !route.includes("["));
  const parts = toSegments(pathname);

  while (parts.length > 0) {
    const candidate = "/" + parts.join("/");
    if (staticRoutes.includes(candidate)) {
      return candidate;
    }
    parts.pop(); // remove last segment
  }

  return "/";
}
