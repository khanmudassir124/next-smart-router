import { matchRoute } from "./route-matcher";
import { getRoutes } from "./route-registry";
import { toSegments } from "./segments";

/**
 * Return the nearest existing ancestor route of `pathname`.
 *
 * Unlike the browser's history-based back, this walks up the path until it
 * finds a segment that matches a known route, so it never lands on a 404.
 * The root ("/") always exists as a fallback.
 */
export function fsBackPathSafe(pathname: string): string {
  const routes = getRoutes();
  const parts = toSegments(pathname);

  while (parts.length > 0) {
    parts.pop();
    const candidate = "/" + parts.join("/");

    if (matchRoute(candidate || "/", routes)) {
      return candidate || "/";
    }
  }

  return "/"; // always exists
}
