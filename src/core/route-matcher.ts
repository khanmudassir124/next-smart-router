import { getRouteState } from "./route-registry";
import { warnIfUninitialized } from "./dev-warn";
import { normalizePath } from "./url";
import type { RouteMeta, RouteState } from "./route-state";
import {
  compareSpecificity,
  getParamName,
  isCatchAll,
  isDynamic,
  isOptionalCatchAll,
  safeDecode,
  toSegments,
} from "./segments";

export type ParamValue = string | string[] | undefined;
export type RouteParams = Record<string, ParamValue>;

export interface RouteMatch {
  /** The route pattern that matched, e.g. "/w/[id]/settings". */
  route: string;
  /** Decoded dynamic params. */
  params: RouteParams;
  /** Metadata registered for the matched route, if any. */
  meta?: RouteMeta;
}

/** Why a pattern failed to match. One member per rejection in the walk below. */
export type RejectReason =
  | "catch-all-not-last"
  | "catch-all-empty"
  | "path-too-short"
  | "literal-mismatch"
  | "path-too-long";

export type PatternMatch =
  | { matched: true; params: RouteParams }
  | { matched: false; reason: RejectReason; atSegment: number };

/**
 * Walk a path against one pattern, reporting either the captured params or the
 * segment index and rule that rejected it.
 *
 * This is the single implementation; {@link matchPatternParams} is a thin
 * wrapper over it. Keeping one walk is what stops the devtools overlay, the
 * explorer and the matcher from drifting apart.
 */
export function explainPatternMatch(path: string, pattern: string): PatternMatch {
  const pathSegs = toSegments(path);
  const routeSegs = toSegments(pattern);
  const params: RouteParams = {};

  let i = 0;
  let j = 0;

  while (i < routeSegs.length) {
    const routeSeg = routeSegs[i];

    if (isOptionalCatchAll(routeSeg)) {
      // Consumes the rest, including nothing. Must be the final segment.
      if (i !== routeSegs.length - 1) {
        return { matched: false, reason: "catch-all-not-last", atSegment: i };
      }
      const rest = pathSegs.slice(j);
      params[getParamName(routeSeg)] = rest.length ? rest.map(safeDecode) : undefined;
      return { matched: true, params };
    }

    if (isCatchAll(routeSeg)) {
      // Consumes one or more remaining segments. Must be the final segment.
      if (i !== routeSegs.length - 1) {
        return { matched: false, reason: "catch-all-not-last", atSegment: i };
      }
      if (j >= pathSegs.length) {
        return { matched: false, reason: "catch-all-empty", atSegment: i };
      }
      params[getParamName(routeSeg)] = pathSegs.slice(j).map(safeDecode);
      return { matched: true, params };
    }

    const pathSeg = pathSegs[j];
    if (pathSeg === undefined) {
      return { matched: false, reason: "path-too-short", atSegment: i };
    }

    if (isDynamic(routeSeg)) {
      params[getParamName(routeSeg)] = safeDecode(pathSeg);
      i++;
      j++;
      continue;
    }

    if (routeSeg !== pathSeg) {
      return { matched: false, reason: "literal-mismatch", atSegment: i };
    }

    i++;
    j++;
  }

  // All route segments consumed — the path must be fully consumed too.
  return j === pathSegs.length
    ? { matched: true, params }
    : { matched: false, reason: "path-too-long", atSegment: routeSegs.length };
}

/**
 * Match a concrete path against a single route pattern and capture its params.
 *
 * Returns `null` when the pattern does not match. Catch-all values are decoded
 * segment by segment, and an empty optional catch-all captures `undefined` —
 * both matching Next.js semantics.
 */
export function matchPatternParams(path: string, pattern: string): RouteParams | null {
  const result = explainPatternMatch(path, pattern);
  return result.matched ? result.params : null;
}

/**
 * Test whether a concrete `path` matches a single route `pattern`.
 *
 * Supports static segments, dynamic segments (`[id]`), catch-all
 * (`[...slug]`, one or more) and optional catch-all (`[[...slug]]`, zero or
 * more). Query strings and hashes on `path` are ignored.
 */
export function matchRoutePattern(path: string, pattern: string): boolean {
  return matchPatternParams(normalizePath(path), pattern) !== null;
}

/* -------------------------------------------------
 * Registry-aware matching
 * ------------------------------------------------- */

function orderedCandidates(
  state: RouteState,
  routes?: Iterable<string>
): readonly string[] {
  if (!routes || routes === state.routes) return state.ordered;
  // A caller-supplied collection carries no precomputed order.
  return [...routes].sort(compareSpecificity);
}

/**
 * Resolve `path` against a route state, returning the most specific match.
 *
 * Pure: takes its routes and config explicitly, so it is safe in middleware,
 * Server Components and tests.
 */
export function matchRouteIn(
  state: RouteState,
  path: string,
  routes?: Iterable<string>
): RouteMatch | null {
  const normalized = normalizePath(path, state.config);

  for (const route of orderedCandidates(state, routes)) {
    const params = matchPatternParams(normalized, route);
    if (!params) continue;

    const meta = state.meta[route];
    return meta ? { route, params, meta } : { route, params };
  }

  return null;
}

/**
 * Resolve `path` to the most specific matching route in the global registry.
 *
 * Candidates are tried in Next.js resolution order, so a static route always
 * wins over a dynamic sibling and a catch-all is the last resort.
 *
 * Returns `null` when nothing matches, so `if (matchRoute(path))` reads the
 * same as it did when this returned a boolean.
 */
export function matchRoute(path: string, routes?: Iterable<string>): RouteMatch | null {
  warnIfUninitialized("matchRoute");
  return matchRouteIn(getRouteState(), path, routes);
}

/** Whether `path` matches any known route. */
export function routeExists(path: string, routes?: Iterable<string>): boolean {
  return matchRoute(path, routes) !== null;
}
