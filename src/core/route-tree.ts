import { getRouteState } from "./route-registry";
import { warnIfUninitialized } from "./dev-warn";
import {
  getParamName,
  isCatchAll,
  isDynamic,
  isOptionalCatchAll,
  toSegments,
} from "./segments";
import type { RouteMeta, RouteState } from "./route-state";
import { normalizePath } from "./url";

export interface RouteNode {
  /** Full route pattern, e.g. "/w/[id]/settings". */
  path: string;
  /** The final segment of `path`, e.g. "settings" or "[id]". */
  segment: string;
  /** True when this node's segment is dynamic, catch-all or optional. */
  dynamic: boolean;
  /** The param name, for dynamic nodes. */
  param?: string;
  /** True when a page exists at this exact path (vs. a pass-through folder). */
  page: boolean;
  meta?: RouteMeta;
  children: RouteNode[];
}

function nodeFor(path: string, state: RouteState, page: boolean): RouteNode {
  const segments = toSegments(path);
  const segment = segments[segments.length - 1] ?? "";
  const dynamic =
    !!segment &&
    (isDynamic(segment) || isCatchAll(segment) || isOptionalCatchAll(segment));

  const node: RouteNode = {
    path: path || "/",
    segment,
    dynamic,
    page,
    children: [],
  };

  if (dynamic) node.param = getParamName(segment);
  const meta = state.meta[path || "/"];
  if (meta) node.meta = meta;

  return node;
}

function buildTree(state: RouteState): RouteNode {
  const pages = new Set(state.routes);
  const nodes = new Map<string, RouteNode>();

  const root = nodeFor("/", state, pages.has("/"));
  nodes.set("/", root);

  // Sorting by depth guarantees a parent exists before its children.
  const sorted = [...state.routes]
    .filter((r) => r !== "/")
    .sort((a, b) => toSegments(a).length - toSegments(b).length || (a < b ? -1 : 1));

  for (const route of sorted) {
    const segments = toSegments(route);

    for (let i = 0; i < segments.length; i++) {
      const path = "/" + segments.slice(0, i + 1).join("/");
      if (nodes.has(path)) continue;

      const parentPath = i === 0 ? "/" : "/" + segments.slice(0, i).join("/");
      const parent = nodes.get(parentPath);
      const node = nodeFor(path, state, pages.has(path));

      nodes.set(path, node);
      parent?.children.push(node);
    }
  }

  return root;
}

let cache: { state: RouteState; tree: RouteNode } | null = null;

/** The app's routes as a tree, rooted at "/". Cached per route state. */
export function getRouteTree(): RouteNode {
  warnIfUninitialized("getRouteTree");

  const state = getRouteState();
  if (cache?.state === state) return cache.tree;

  const tree = buildTree(state);
  cache = { state, tree };
  return tree;
}

/** Look up a single node by route pattern. */
export function getRouteNode(route: string): RouteNode | null {
  const target = normalizePath(route);
  const walk = (node: RouteNode): RouteNode | null => {
    if (node.path === target) return node;
    for (const child of node.children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(getRouteTree());
}

/**
 * Direct children of a route pattern, page-bearing only by default.
 *
 * This is what turns the filesystem into a navigation menu: add a folder with
 * a page, and the tab appears.
 */
export function getChildren(
  route: string,
  options: { includeHidden?: boolean; includePassthrough?: boolean } = {}
): RouteNode[] {
  const node = getRouteNode(route);
  if (!node) return [];

  return node.children.filter(
    (child) =>
      (options.includePassthrough || child.page) &&
      (options.includeHidden || child.meta?.hidden !== true)
  );
}

/** Siblings of a route pattern, excluding itself. */
export function getSiblings(
  route: string,
  options: { includeHidden?: boolean } = {}
): RouteNode[] {
  const parent = getParent(route);
  if (parent === null) return [];
  return getChildren(parent, options).filter(
    (child) => child.path !== normalizePath(route)
  );
}

/** The parent route pattern, or `null` at the root. */
export function getParent(route: string): string | null {
  const segments = toSegments(normalizePath(route));
  if (segments.length === 0) return null;
  segments.pop();
  return "/" + segments.join("/");
}

/** Number of path segments in a route pattern. */
export function getDepth(route: string): number {
  return toSegments(normalizePath(route)).length;
}

/** Every route pattern under `route`, depth-first. */
export function getDescendants(route: string): RouteNode[] {
  const node = getRouteNode(route);
  if (!node) return [];

  const out: RouteNode[] = [];
  const walk = (n: RouteNode) => {
    for (const child of n.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

/** Drop the memoized tree. Intended for tests. */
export function clearRouteTreeCache(): void {
  cache = null;
}
