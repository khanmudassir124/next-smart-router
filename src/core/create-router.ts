/**
 * A router instance with no global state.
 *
 * Everything the package can do, bound to an explicit route set and config.
 * This is what makes the library usable in `middleware.ts` (edge runtime, no
 * initialization step), in Server Components, in tests that need two route
 * sets in one process, and in plain Node scripts.
 */

import {
  applyBasePath,
  applyTrailingSlash,
  normalizePath,
  carryQuery,
  selectQuery,
} from "./url";
import {
  compareSpecificity,
  isStaticRoute,
  safeDecode,
  sentenceCase,
  titleCase,
  toSegments,
} from "./segments";
import { matchPatternParams, matchRouteIn, type RouteMatch } from "./route-matcher";
import {
  createRouteState,
  type CreateRouteStateOptions,
  type RouteMeta,
  type RouteState,
} from "./route-state";
import { resolvePath } from "./resolve-path";
import { buildHref, type BuildHrefOptions } from "./build-href";
import type { BuildParamsOf, ParamsOf, Route } from "./typed-routes";
import type { Breadcrumb, BreadcrumbOptions } from "./breadcrumbs";
import { isActiveIn, type IsActiveOptions } from "./is-active";

export interface SmartRouterInstance {
  /** The underlying, pre-sorted route state. */
  readonly state: RouteState;
  /** Every known route pattern. */
  readonly routes: readonly string[];

  /** Resolve a path to its most specific route, with params and meta. */
  match(path: string): RouteMatch | null;
  /** Whether a path matches any known route. */
  exists(path: string): boolean;
  /** Extract params for a path, optionally against one named pattern. */
  params<R extends Route>(path: string, route?: R): ParamsOf<R>;
  /** Fill a route pattern with params to produce an encoded href. */
  build<R extends Route>(
    route: R,
    params: BuildParamsOf<R>,
    options?: BuildHrefOptions
  ): string;
  /** Resolve a filesystem-style relative target against a current path. */
  resolve(current: string, target: string): string;
  /** Nearest existing ancestor route — never a 404. */
  fsBack(path: string, levels?: number): string;
  /** Nearest ancestor with no dynamic segments. */
  nearestStatic(path: string, options?: { includeSelf?: boolean }): string;
  /** Breadcrumb trail for a path. */
  breadcrumbs(path: string, options?: BreadcrumbOptions): Breadcrumb[];
  /** Whether a nav target should render as active for a path. */
  isActive(path: string, target: string, options?: IsActiveOptions): boolean;
  /** Metadata registered for a route pattern. */
  meta(route: string): RouteMeta | undefined;
  /** Carry the configured sticky query params from one URL onto another. */
  withSticky(from: string, to: string): string;
  /** Reduce a URL to a bare, comparable pathname. */
  normalize(path: string): string;
}

/**
 * Create a router bound to a fixed set of routes.
 *
 * @example
 * const router = createRouter(ROUTES, { basePath: "/app", meta: META });
 *
 * router.match("/app/w/42/settings");
 * // { route: "/w/[id]/settings", params: { id: "42" }, meta: { title: "Settings" } }
 */
export function createRouter(
  routes: Iterable<string>,
  options: CreateRouteStateOptions = {}
): SmartRouterInstance {
  const state = createRouteState(routes, options);
  const config = state.config;

  const out = (path: string): string =>
    applyBasePath(applyTrailingSlash(path, config.trailingSlash), config.basePath);

  const instance: SmartRouterInstance = {
    state,
    routes: state.ordered,

    match: (path) => matchRouteIn(state, path),

    exists: (path) => matchRouteIn(state, path) !== null,

    params: (path, route) => {
      const normalized = normalizePath(path, config);
      if (route) return (matchPatternParams(normalized, route) ?? {}) as any;
      return (matchRouteIn(state, normalized)?.params ?? {}) as any;
    },

    build: (route, params, buildOptions) =>
      out(buildHref(route, params, { ...buildOptions, raw: true })),

    resolve: (current, target) => resolvePath(normalizePath(current, config), target),

    fsBack: (path, levels = 1) => {
      const parts = toSegments(normalizePath(path, config));
      for (let i = 0; i < Math.max(1, levels) && parts.length > 0; i++) parts.pop();

      while (parts.length > 0) {
        const candidate = "/" + parts.join("/");
        if (matchRouteIn(state, candidate)) return out(candidate);
        parts.pop();
      }
      return out("/");
    },

    nearestStatic: (path, nearestOptions = {}) => {
      const parts = toSegments(normalizePath(path, config));
      if (nearestOptions.includeSelf === false) parts.pop();

      while (parts.length > 0) {
        const candidate = "/" + parts.join("/");
        if (state.staticRoutes.includes(candidate)) return out(candidate);
        parts.pop();
      }
      return out("/");
    },

    breadcrumbs: (path, crumbOptions = {}) =>
      buildBreadcrumbs(state, path, crumbOptions),

    isActive: (path, target, activeOptions = {}) =>
      isActiveIn(state, path, target, activeOptions),

    meta: (route) => state.meta[route],

    withSticky: (from, to) => {
      if (!config.stickyQuery.length) return to;

      const carried = selectQuery(from, config.stickyQuery);
      if (Object.keys(carried).length === 0) return to;

      // Explicit params on the target win over carried ones.
      return carryQuery(to, carried);
    },

    normalize: (path) => normalizePath(path, config),
  };

  return instance;
}

/* -------------------------------------------------
 * Shared implementations (state passed in explicitly)
 * ------------------------------------------------- */

function buildBreadcrumbs(
  state: RouteState,
  pathname: string,
  options: BreadcrumbOptions
): Breadcrumb[] {
  const normalized = normalizePath(pathname, state.config);
  const parts = toSegments(normalized);
  const crumbs: Breadcrumb[] = [];

  const format = (segment: string): string => {
    if (options.format === "title") return titleCase(segment);
    if (options.format === "sentence") return sentenceCase(segment);
    return segment;
  };

  if (options.includeRoot) {
    crumbs.push({
      label: options.rootLabel ?? "Home",
      href: "/",
      segment: "",
      pattern: "/",
      isCurrent: parts.length === 0,
      matched: true,
    });
  }

  for (let i = 0; i < parts.length; i++) {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const match = matchRouteIn(state, href);
    const matched = match !== null;

    if (!matched && options.unmatched !== "text") continue;

    const segment = safeDecode(parts[i]);
    const pattern = match?.route ?? "";
    const patternSeg = pattern ? toSegments(pattern)[i] : undefined;
    const param =
      patternSeg && patternSeg.startsWith("[")
        ? patternSeg.replace(/\[|\]|\.\.\./g, "")
        : undefined;

    const base: Omit<Breadcrumb, "label"> = {
      href,
      segment,
      pattern,
      param,
      isCurrent: i === parts.length - 1,
      matched,
    };

    crumbs.push({
      ...base,
      label:
        options.labelFor?.(base) ??
        options.labels?.[href] ??
        options.labels?.[segment] ??
        match?.meta?.title ??
        format(segment),
    });
  }

  if (crumbs.length) crumbs[crumbs.length - 1].isCurrent = true;
  return crumbs;
}

/* -------------------------------------------------
 * Manifest validation
 * ------------------------------------------------- */

export interface RouteConflict {
  level: "error" | "warning";
  kind: "duplicate" | "catch-all-not-last" | "param-name-mismatch";
  message: string;
  routes: string[];
}

/**
 * Check a route set for the mistakes that produce silently unreachable pages.
 *
 * Used by `next-smart-router generate --check`, and exported so a consumer can
 * assert on its own manifest in a test.
 */
export function validateRoutes(routes: Iterable<string>): RouteConflict[] {
  const list = [...new Set(routes)].sort(compareSpecificity);
  const conflicts: RouteConflict[] = [];

  // A catch-all anywhere but the final position can never match.
  for (const route of list) {
    const segments = toSegments(route);
    segments.forEach((seg, i) => {
      const catchAll = seg.startsWith("[...") || seg.startsWith("[[...");
      if (catchAll && i !== segments.length - 1) {
        conflicts.push({
          level: "error",
          kind: "catch-all-not-last",
          message: `catch-all "${seg}" is not the final segment, so "${route}" can never match`,
          routes: [route],
        });
      }
    });
  }

  // Two dynamic siblings with different param names — Next.js errors on this.
  const byParent = new Map<string, Map<string, string[]>>();
  for (const route of list) {
    const segments = toSegments(route);
    if (segments.length === 0) continue;

    const last = segments[segments.length - 1];
    if (!last.startsWith("[")) continue;

    const parent = "/" + segments.slice(0, -1).join("/");
    const name = last.replace(/\[|\]|\.\.\./g, "");

    const group = byParent.get(parent) ?? new Map<string, string[]>();
    group.set(name, [...(group.get(name) ?? []), route]);
    byParent.set(parent, group);
  }

  for (const [parent, group] of byParent) {
    if (group.size <= 1) continue;
    conflicts.push({
      level: "warning",
      kind: "param-name-mismatch",
      message:
        `conflicting dynamic segment names under "${parent}": ` +
        [...group.keys()].map((n) => `[${n}]`).join(", "),
      routes: [...group.values()].flat(),
    });
  }

  // Static routes are unique by construction (a Set), but a caller may pass a
  // list containing duplicates.
  const seen = new Set<string>();
  for (const route of routes) {
    if (seen.has(route)) {
      conflicts.push({
        level: "warning",
        kind: "duplicate",
        message: `route "${route}" is listed more than once`,
        routes: [route],
      });
    }
    seen.add(route);
  }

  return conflicts;
}

/** Whether a route pattern contains no dynamic segments. Re-exported for CLI use. */
export { isStaticRoute };
