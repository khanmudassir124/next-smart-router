/**
 * next-smart-router
 *
 * Filesystem-style routing helpers for the Next.js App Router.
 *
 * Everything exported here is server-safe. React hooks and components live in
 * a separate client entry: `next-smart-router/react`.
 */

/* -------------------------------------------------
 * Setup
 * ------------------------------------------------- */

export {
  initializeSmartRouter,
  resetSmartRouter,
  isSmartRouterInitialized,
  type InitializeSmartRouterOptions,
} from "./core/initialize-smart-router";

export {
  getConfig,
  setConfig,
  resetConfig,
  DEFAULT_CONFIG,
  DEFAULT_TRANSFER,
  type SmartRouterConfig,
  type SmartRouterConfigInput,
  type TransferConfig,
  type TransferStrategy,
  type StickyMatcher,
} from "./core/config";

export {
  setRoutes,
  setRouteMeta,
  getRoutes,
  getOrderedRoutes,
  getStaticRoutes,
  getRouteMetaMap,
  getRouteState,
  hasRoutes,
  clearRoutes,
} from "./core/route-registry";

export {
  createRouteState,
  type RouteState,
  type RouteMeta,
  type RouteMetaMap,
} from "./core/route-state";

/* -------------------------------------------------
 * Matching
 * ------------------------------------------------- */

export {
  matchRoute,
  matchRouteIn,
  matchRoutePattern,
  matchPatternParams,
  routeExists,
  type RouteMatch,
  type RouteParams,
  type ParamValue,
} from "./core/route-matcher";

export {
  createRouter,
  validateRoutes,
  type SmartRouterInstance,
  type RouteConflict,
} from "./core/create-router";

/* -------------------------------------------------
 * Paths
 * ------------------------------------------------- */

export { resolvePath, resolveUp } from "./core/resolve-path";

export {
  buildHref,
  tryBuildHref,
  SmartRouterHrefError,
  type BuildHrefOptions,
} from "./core/build-href";

export { isActive, type IsActiveOptions } from "./core/is-active";

export { fsBackPathSafe, type FsBackOptions } from "./core/fs-back";

export {
  getNearestStaticRoute,
  type NearestStaticRouteOptions,
} from "./core/get-nearest-static-route";

export {
  getParams,
  SmartRouterParamError,
  type ParamsFromKeys,
  type Coercers,
  type GetParamsOptions,
  type StandardSchemaLike,
} from "./core/get-params";

export {
  getBreadcrumbs,
  type Breadcrumb,
  type BreadcrumbOptions,
} from "./core/breadcrumbs";

/* -------------------------------------------------
 * Route tree
 * ------------------------------------------------- */

export {
  getRouteTree,
  getRouteNode,
  getChildren,
  getSiblings,
  getParent,
  getDepth,
  getDescendants,
  clearRouteTreeCache,
  type RouteNode,
} from "./core/route-tree";

/* -------------------------------------------------
 * URL & query
 * ------------------------------------------------- */

export {
  splitUrl,
  toPathname,
  parseQuery,
  buildQuery,
  withQuery,
  setQuery,
  pickQuery,
  omitQuery,
  mergeQuery,
  selectQuery,
  normalizePath,
  applyBasePath,
  applyTrailingSlash,
  type UrlParts,
  type QueryInput,
  type QueryValue,
  type QueryOptions,
  type ParsedQuery,
  type ArrayFormat,
  type NormalizeOptions,
} from "./core/url";

export {
  createParser,
  defineSearchParams,
  parseAsString,
  parseAsInt,
  parseAsFloat,
  parseAsBoolean,
  parseAsIsoDate,
  parseAsDateOnly,
  parseAsEnum,
  parseAsArrayOf,
  parseAsJson,
  parseAsSortOrder,
  type Parser,
  type ParserSpec,
  type ParserOptions,
  type ParserMap,
  type InferParserMap,
  type SearchParamsDefinition,
  type SortOrder,
} from "./core/parsers";

/* -------------------------------------------------
 * Transfer & events
 * ------------------------------------------------- */

export {
  writeTransfer,
  readTransfer,
  clearTransfer,
  clearTransferFor,
  subscribeTransfer,
  writeFlash,
  consumeFlash,
  peekFlash,
  resetTransfer,
  TRANSFER_KEY_PARAM,
  type FlashMessage,
  type TransferEnvelope,
} from "./core/transfer";

export {
  subscribeNavigation,
  emitNavigation,
  onBeforeNavigate,
  hasGuards,
  runGuards,
  resetNavigationListeners,
  resetNavigationGuards,
  type NavigationEvent,
  type NavigationType,
  type NavigationListener,
  type NavigationGuard,
  type NavigationGuardContext,
} from "./core/events";

/* -------------------------------------------------
 * History
 * ------------------------------------------------- */

export {
  smartHistory,
  createSmartHistory,
  SmartHistory,
  type SmartHistoryOptions,
} from "./core/history";

/* -------------------------------------------------
 * Segments & types
 * ------------------------------------------------- */

export {
  isDynamic,
  isCatchAll,
  isOptionalCatchAll,
  isStaticRoute,
  getParamName,
  toSegments,
  safeDecode,
  segmentRank,
  compareSpecificity,
  titleCase,
  sentenceCase,
} from "./core/segments";

export type {
  Register,
  Route,
  ParamsOf,
  BuildParamsOf,
  RegisteredMeta,
  Simplify,
} from "./core/typed-routes";
