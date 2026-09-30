import {
  explainPatternMatch,
  type RejectReason,
  type RouteParams,
} from "./route-matcher";
import { createRouteState, type CreateRouteStateOptions } from "./route-state";
import type { RouteMeta, RouteState } from "./route-state";
import { normalizePath, selectQuery, type ParsedQuery } from "./url";

/**
 * Explain how a URL resolves: not just which pattern won, but which patterns
 * also matched and lost, and why each of the rest was rejected.
 *
 *   href "/w/42/settings"  against  [ / , /w/[id] , /w/[id]/settings , /w/[id]/[tab] ]
 *          │
 *          ├── /                  ✗ path-too-long      @0
 *          ├── /w/[id]            ✗ path-too-long      @2
 *          ├── /w/[id]/settings   ✓ WINNER  rank 3/4   { id: "42" }
 *          └── /w/[id]/[tab]      ✓ near miss          { id: "42", tab: "settings" }
 *
 * Candidates are walked in specificity order, so the first match is the winner
 * for exactly the same reason `matchRouteIn` returns it.
 */

export interface ExplainedCandidate {
  route: string;
  /** 1-based position in specificity order. */
  rank: number;
  matched: boolean;
  /** Absent when `matched`. */
  reason?: RejectReason;
  /** Segment index that decided the rejection. Absent when `matched`. */
  atSegment?: number;
}

export interface ExplainedWinner {
  route: string;
  params: RouteParams;
  rank: number;
  meta?: RouteMeta;
}

export interface ExplainedNearMiss {
  route: string;
  params: RouteParams;
  rank: number;
}

export interface RouteExplanation {
  /** The pattern that resolves, or null when nothing matched. */
  winner: ExplainedWinner | null;
  /** Every pattern considered, in specificity order, with a verdict. */
  candidates: ExplainedCandidate[];
  /**
   * Patterns that matched but lost on specificity. Uncapped — a view that
   * wants the top few slices this itself.
   */
  nearMisses: ExplainedNearMiss[];
  /** Query params this route set would carry across a navigation. */
  stickyQuery: ParsedQuery;
  /** How many patterns were considered. The denominator for `rank`. */
  total: number;
}

/**
 * Explain `href` against an explicit route state.
 *
 * Takes state rather than a route list because `createRouteState` sorts on
 * every call, and this runs on every navigation in the devtools overlay. Same
 * reason `matchRouteIn` takes state.
 */
export function explainIn(state: RouteState, href: string): RouteExplanation {
  const normalized = normalizePath(href, state.config);
  const candidates: ExplainedCandidate[] = [];
  const nearMisses: ExplainedNearMiss[] = [];
  let winner: ExplainedWinner | null = null;

  state.ordered.forEach((route, index) => {
    const rank = index + 1;
    const result = explainPatternMatch(normalized, route);

    if (!result.matched) {
      candidates.push({
        route,
        rank,
        matched: false,
        reason: result.reason,
        atSegment: result.atSegment,
      });
      return;
    }

    candidates.push({ route, rank, matched: true });

    if (winner) {
      nearMisses.push({ route, params: result.params, rank });
      return;
    }

    const meta = state.meta[route];
    winner = meta
      ? { route, params: result.params, rank, meta }
      : { route, params: result.params, rank };
  });

  return {
    winner,
    candidates,
    nearMisses,
    // Sticky selection reads the query string, so it takes the raw href —
    // `normalized` has already had the query stripped off.
    stickyQuery: selectQuery(href, state.config.stickyQuery),
    total: state.ordered.length,
  };
}

/**
 * Explain `href` against a route list.
 *
 * Convenience wrapper that builds a state per call. For anything repeated,
 * build the state once and use {@link explainIn}.
 *
 * @example
 * explain("/w/42/settings", ["/", "/w/[id]", "/w/[id]/settings"]).winner?.route;
 * // -> "/w/[id]/settings"
 */
export function explain(
  href: string,
  routes: Iterable<string>,
  options: CreateRouteStateOptions = {}
): RouteExplanation {
  return explainIn(createRouteState(routes, options), href);
}
