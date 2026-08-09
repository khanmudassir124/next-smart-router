// The client directive is re-added to the bundled output by tsup
// (see tsup.config.ts and scripts/add-use-client.mjs).

export {
  useSmartRouter,
  type SmartRouter,
  type NextAppRouter,
  type NavigateOptions,
  type PrefetchOptions,
} from "./react/use-smart-router";

export {
  useRoute,
  useIsActive,
  useBreadcrumbs,
  type UseRouteResult,
  type UseRouteOptions,
} from "./react/use-route";

export {
  useQueryState,
  useQueryStates,
  useSearchParamsObject,
  type QueryStateOptions,
} from "./react/use-query-state";

export {
  useRouteState,
  useRouteStateOr,
  useClearRouteState,
  useFlash,
} from "./react/use-route-state";

export {
  useRouteTree,
  useChildren,
  useSiblings,
  type RouteNode,
  type RouteTreeOptions,
} from "./react/use-route-tree";

export {
  useNavigationGuard,
  type NavigationGuardOptions,
} from "./react/use-navigation-guard";

export {
  SmartHistoryProvider,
  useSmartHistory,
  type SmartHistoryProviderProps,
  type UseSmartHistoryResult,
} from "./react/history-provider";

export {
  SmartLink,
  type SmartLinkProps,
  type PrefetchStrategy,
} from "./react/smart-link";

export { SmartRouterDevtools, type SmartRouterDevtoolsProps } from "./react/devtools";

export {
  useLocationSearch,
  useClientLocationSearch,
  useLocationHref,
  applyShallowUrl,
  notifyLocationChange,
} from "./react/use-location";

// Re-export the native next/navigation hooks so consumers can grab the raw
// Next router (and friends) from the same import as the smart router.
export { useRouter, usePathname, useSearchParams, useParams } from "next/navigation";
