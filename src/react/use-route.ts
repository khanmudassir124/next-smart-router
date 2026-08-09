"use client";

import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";

import {
  getBreadcrumbs,
  type Breadcrumb,
  type BreadcrumbOptions,
} from "../core/breadcrumbs";
import { isActive as isActiveCore, type IsActiveOptions } from "../core/is-active";
import { matchRoute, type RouteParams } from "../core/route-matcher";
import type { RouteMeta } from "../core/route-state";
import { useLocationSearch } from "./use-location";
import { useSmartRouter, type SmartRouter } from "./use-smart-router";

export interface UseRouteResult {
  /** The current pathname. */
  pathname: string;
  /** The matched route pattern, e.g. "/w/[id]/settings". `null` if unknown. */
  route: string | null;
  /** Decoded dynamic params for the current path. */
  params: RouteParams;
  /** Current search params as a plain object. */
  search: Record<string, string>;
  /** Metadata registered for the matched route. */
  meta?: RouteMeta;
  /** Breadcrumb trail for the current path. */
  breadcrumbs: Breadcrumb[];
  /** Whether a nav target should render as active. */
  isActive: (target: string, options?: IsActiveOptions) => boolean;
  /** The navigation API. */
  nav: SmartRouter;
}

export interface UseRouteOptions {
  breadcrumbs?: BreadcrumbOptions;
}

/**
 * Everything about the current route in one memoized object, replacing the
 * four hooks (`usePathname`, `useParams`, `useSearchParams`, `useSmartRouter`)
 * a typical page reaches for — plus the pattern, which none of them expose.
 */
export function useRoute(options: UseRouteOptions = {}): UseRouteResult {
  const pathname = usePathname() ?? "/";
  const searchString = useLocationSearch();
  const nav = useSmartRouter();

  const match = useMemo(() => matchRoute(pathname), [pathname]);

  const search = useMemo(
    () => Object.fromEntries(new URLSearchParams(searchString)),
    [searchString]
  );

  const breadcrumbOptions = options.breadcrumbs;
  const breadcrumbs = useMemo(
    () => getBreadcrumbs(pathname, breadcrumbOptions),
    [pathname, breadcrumbOptions]
  );

  const isActive = useCallback(
    (target: string, activeOptions?: IsActiveOptions) =>
      isActiveCore(pathname, target, activeOptions),
    [pathname]
  );

  return useMemo(
    () => ({
      pathname,
      route: match?.route ?? null,
      params: match?.params ?? {},
      search,
      meta: match?.meta,
      breadcrumbs,
      isActive,
      nav,
    }),
    [pathname, match, search, breadcrumbs, isActive, nav]
  );
}

/**
 * A stable `isActive` bound to the current pathname.
 *
 * @example
 * const isActive = useIsActive();
 * <Link href="/w" aria-current={isActive("/w") ? "page" : undefined} />
 */
export function useIsActive(): (target: string, options?: IsActiveOptions) => boolean {
  const pathname = usePathname() ?? "/";
  return useCallback(
    (target: string, options?: IsActiveOptions) =>
      isActiveCore(pathname, target, options),
    [pathname]
  );
}

/** The breadcrumb trail for the current path. */
export function useBreadcrumbs(options?: BreadcrumbOptions): Breadcrumb[] {
  const pathname = usePathname() ?? "/";
  return useMemo(() => getBreadcrumbs(pathname, options), [pathname, options]);
}
