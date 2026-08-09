"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { matchRoute } from "../core/route-matcher";
import {
  getChildren,
  getRouteTree,
  getSiblings,
  type RouteNode,
} from "../core/route-tree";
import { resolvePath } from "../core/resolve-path";

export type { RouteNode };

export interface RouteTreeOptions {
  includeHidden?: boolean;
  includePassthrough?: boolean;
}

/** The app's routes as a tree, rooted at "/". */
export function useRouteTree(): RouteNode {
  return useMemo(() => getRouteTree(), []);
}

/**
 * Direct children of a route, for building navigation from the filesystem.
 *
 * `route` may be a pattern ("/w/[id]"), an absolute path ("/w/42" — resolved
 * to its pattern), or a relative target ("./" for the current route's
 * children, "../" for its siblings' parent).
 *
 * @example
 * const tabs = useChildren("./");
 * return tabs.map((t) => (
 *   <SmartLink key={t.path} href={t.path} activeClassName="is-active">
 *     {t.meta?.title ?? t.segment}
 *   </SmartLink>
 * ));
 */
export function useChildren(route = "./", options: RouteTreeOptions = {}): RouteNode[] {
  const pattern = useResolvedPattern(route);
  const { includeHidden, includePassthrough } = options;

  return useMemo(
    () => (pattern ? getChildren(pattern, { includeHidden, includePassthrough }) : []),
    [pattern, includeHidden, includePassthrough]
  );
}

/** Siblings of a route, excluding itself. */
export function useSiblings(route = "./", options: RouteTreeOptions = {}): RouteNode[] {
  const pattern = useResolvedPattern(route);
  const { includeHidden } = options;

  return useMemo(
    () => (pattern ? getSiblings(pattern, { includeHidden }) : []),
    [pattern, includeHidden]
  );
}

/**
 * Turn a pattern, concrete path or relative target into a route *pattern*,
 * which is what the tree is keyed by.
 */
function useResolvedPattern(route: string): string | null {
  const pathname = usePathname() ?? "/";

  return useMemo(() => {
    if (route.includes("[")) return route;

    const absolute = route.startsWith("/") ? route : resolvePath(pathname, route);

    return matchRoute(absolute)?.route ?? absolute;
  }, [route, pathname]);
}
