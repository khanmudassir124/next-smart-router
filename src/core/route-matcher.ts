import { getRoutes } from "./route-registry";
import {
  isCatchAll,
  isDynamic,
  isOptionalCatchAll,
  toSegments,
} from "./segments";

/**
 * Test whether a concrete `path` matches a single route `pattern`.
 *
 * Supports static segments, dynamic segments (`[id]`), catch-all
 * (`[...slug]`, one or more) and optional catch-all (`[[...slug]]`, zero or
 * more).
 */
export function matchRoutePattern(path: string, pattern: string): boolean {
  const pathSegs = toSegments(path);
  const routeSegs = toSegments(pattern);

  let i = 0; // index into routeSegs
  let j = 0; // index into pathSegs

  while (i < routeSegs.length) {
    const routeSeg = routeSegs[i];

    if (isOptionalCatchAll(routeSeg)) {
      // Consumes the rest (including nothing). Must be the last segment.
      return i === routeSegs.length - 1;
    }

    if (isCatchAll(routeSeg)) {
      // Consumes one or more remaining segments. Must be the last segment.
      return i === routeSegs.length - 1 && j < pathSegs.length;
    }

    const pathSeg = pathSegs[j];
    if (pathSeg === undefined) return false;

    if (isDynamic(routeSeg)) {
      i++;
      j++;
      continue;
    }

    if (routeSeg !== pathSeg) return false;

    i++;
    j++;
  }

  // All route segments consumed — the path must be fully consumed too.
  return j === pathSegs.length;
}

/**
 * Test whether `path` matches any route in `routes`
 * (defaults to the registered routes).
 */
export function matchRoute(
  path: string,
  routes: Set<string> = getRoutes()
): boolean {
  for (const route of routes) {
    if (matchRoutePattern(path, route)) return true;
  }
  return false;
}
