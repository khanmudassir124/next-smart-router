import { warnIfUninitialized } from "./dev-warn";
import { matchRouteIn } from "./route-matcher";
import { getRouteState } from "./route-registry";
import { toSegments } from "./segments";
import type { RouteState } from "./route-state";
import {
  buildQuery,
  localeOf,
  normalizePath,
  selectQuery,
  toUrlPath,
  withLocale,
} from "./url";

export interface FsBackOptions {
  /** How many levels to walk up before starting the search. Default 1. */
  levels?: number;
  /** Carry the configured sticky query params onto the resulting href. */
  keepSticky?: boolean;
}

/**
 * Return the nearest existing ancestor route of `pathname`.
 *
 * Unlike the browser's history-based back, this walks up the path until it
 * finds a segment that matches a known route, so it never lands on a 404.
 * The root ("/") always exists as a fallback.
 *
 * Returns a full URL path — locale kept, `trailingSlash` and `basePath`
 * applied — for `<a href>`, redirects and `window.location`. `nav.fsBack()`
 * is the one to use for router navigation.
 */
export function fsBackPathSafe(pathname: string, options: FsBackOptions = {}): string {
  warnIfUninitialized("fsBackPathSafe");
  const state = getRouteState();
  return toUrlPath(fsBackIn(state, pathname, options), state.config);
}

/**
 * {@link fsBackPathSafe} as a Next-relative href — locale kept, no `basePath`
 * — the form `router.push` takes. Next prefixes `basePath` itself, so handing
 * it the public result would navigate to `/app/app/...`.
 */
export function fsBackPath(pathname: string, options: FsBackOptions = {}): string {
  return fsBackIn(getRouteState(), pathname, options);
}

/** The walk behind both, against an explicit state — what `createRouter` uses. */
export function fsBackIn(
  state: RouteState,
  pathname: string,
  options: FsBackOptions = {}
): string {
  const locale = localeOf(pathname, state.config);
  const parts = toSegments(normalizePath(pathname, state.config));
  const levels = Math.max(1, options.levels ?? 1);

  for (let i = 0; i < levels && parts.length > 0; i++) parts.pop();

  let result = "/";

  while (parts.length > 0) {
    const candidate = "/" + parts.join("/");
    if (matchRouteIn(state, candidate)) {
      result = candidate;
      break;
    }
    parts.pop();
  }

  const sticky =
    options.keepSticky && state.config.stickyQuery.length
      ? buildQuery(selectQuery(pathname, state.config.stickyQuery))
      : "";

  return withLocale(result, locale) + sticky;
}
