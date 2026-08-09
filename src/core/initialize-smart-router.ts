import { resetConfig, setConfig, type SmartRouterConfigInput } from "./config";
import { resetWarnings } from "./dev-warn";
import { clearRoutes, setRoutes } from "./route-registry";
import { clearRouteTreeCache } from "./route-tree";
import type { RouteMetaMap } from "./route-state";

export interface InitializeSmartRouterOptions extends SmartRouterConfigInput {
  /** The known route patterns, e.g. the `ROUTES` set from a generated manifest. */
  routes: Iterable<string>;
  /** Per-route metadata, e.g. the `META` map from a generated manifest. */
  meta?: RouteMetaMap;
  /** Re-initialize even if already initialized. Useful for tests and HMR. */
  force?: boolean;
}

let initialized = false;

/**
 * Initialize SmartRouter with the app's known routes and configuration.
 *
 * Call this ONCE, as early as possible in the consumer app (a root layout, a
 * client provider, or an instrumentation file). Subsequent calls are ignored
 * unless `force` is set.
 *
 * Note that Next.js builds the server and client as separate module graphs, so
 * this runs once per graph. Calling it from a module both graphs import — the
 * generated manifest is the natural place — covers both. Where that isn't
 * practical, prefer `createRouter()`, which carries its routes explicitly.
 *
 * @example
 * import { initializeSmartRouter } from "next-smart-router";
 * import { ROUTES, META } from "@/route-manifest";
 *
 * initializeSmartRouter({
 *   routes: ROUTES,
 *   meta: META,
 *   basePath: "/app",
 *   stickyQuery: ["locale", /^utm_/],
 * });
 */
export function initializeSmartRouter(options: InitializeSmartRouterOptions): void {
  if (initialized && !options.force) return;

  const { routes, meta, force: _force, ...config } = options;

  setConfig(config);
  setRoutes(routes, meta);
  clearRouteTreeCache();
  initialized = true;
}

/** Reset routes, config and the initialized flag. Intended for tests. */
export function resetSmartRouter(): void {
  initialized = false;
  resetConfig();
  clearRoutes();
  clearRouteTreeCache();
  resetWarnings();
}

/** Whether {@link initializeSmartRouter} has run. */
export function isSmartRouterInitialized(): boolean {
  return initialized;
}
