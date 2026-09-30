/**
 * Programmatic access to the generator.
 *
 * One subpath — `next-smart-router/cli` — rather than a deep path per module,
 * so the public surface matches what the docs can reasonably promise.
 */

export {
  collectRoutes,
  type FoundRoute,
  generateRoutes,
  type GenerateRoutesOptions,
  type GenerateResult,
  type RouteConflict,
} from "./generate-routes";

export { watchRoutes, type WatchOptions } from "./watch";
