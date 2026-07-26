import { setRoutes } from "./route-registry";

export interface InitializeSmartRouterOptions {
  /** The known route patterns, e.g. the `ROUTES` set from a generated manifest. */
  routes: Iterable<string>;
  /** Re-initialize even if already initialized. Useful for tests/HMR. */
  force?: boolean;
}

let initialized = false;

/**
 * Initialize SmartRouter with the app's known routes.
 *
 * Call this ONCE, as early as possible in the consumer app (e.g. a root
 * layout, a client provider, or an instrumentation file). Subsequent calls are
 * ignored unless `force` is set.
 *
 * @example
 * import { initializeSmartRouter } from "next-smart-router";
 * import { ROUTES } from "@/route-manifest"; // produced by the CLI
 *
 * initializeSmartRouter({ routes: ROUTES });
 */
export function initializeSmartRouter(
  options: InitializeSmartRouterOptions
): void {
  if (initialized && !options.force) return;

  setRoutes(options.routes);
  initialized = true;
}

/** Reset the initialized flag. Intended for tests. */
export function resetSmartRouter(): void {
  initialized = false;
}

/** Whether {@link initializeSmartRouter} has run. */
export function isSmartRouterInitialized(): boolean {
  return initialized;
}
