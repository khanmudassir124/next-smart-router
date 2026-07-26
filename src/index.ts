/**
 * next-smart-router
 *
 * Filesystem-style routing helpers for the Next.js App Router.
 *
 * The React hook lives in a separate client entry: `next-smart-router/react`.
 */

export {
  initializeSmartRouter,
  resetSmartRouter,
  isSmartRouterInitialized,
  type InitializeSmartRouterOptions,
} from "./core/initialize-smart-router";

export {
  setRoutes,
  getRoutes,
  hasRoutes,
} from "./core/route-registry";

export {
  matchRoute,
  matchRoutePattern,
} from "./core/route-matcher";

export { resolvePath } from "./core/resolve-path";

export {
  getParams,
  type ParamValue,
  type ParamsFromKeys,
  type Coercers,
  type GetParamsOptions,
} from "./core/get-params";

export {
  getBreadcrumbs,
  type Breadcrumb,
} from "./core/breadcrumbs";

export { fsBackPathSafe } from "./core/fs-back";

export { getNearestStaticRoute } from "./core/get-nearest-static-route";

export { smartHistory, type SmartHistory } from "./core/history";

export {
  isDynamic,
  isCatchAll,
  isOptionalCatchAll,
  getParamName,
  toSegments,
} from "./core/segments";
