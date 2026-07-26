/**
 * Central registry that holds the set of known routes for the app.
 *
 * Routes are Next.js App Router path patterns, e.g.
 *   "/", "/workspaces", "/workspaces/[id]", "/docs/[...slug]"
 *
 * The registry starts with only the root route ("/") and is populated by the
 * consumer app via {@link initializeSmartRouter} (usually with a manifest
 * produced by the `next-smart-router generate` CLI).
 */

let ROUTES: Set<string> = new Set(["/"]);

/**
 * Replace the set of known routes. Always keeps "/" present.
 */
export function setRoutes(routes: Iterable<string>): void {
  ROUTES = new Set(["/", ...routes]);
}

/**
 * Return the current set of known routes. Read lazily at call time so that
 * routes registered after module evaluation are always visible.
 */
export function getRoutes(): Set<string> {
  return ROUTES;
}

/**
 * Whether any routes beyond the implicit root have been registered.
 */
export function hasRoutes(): boolean {
  return ROUTES.size > 1;
}
