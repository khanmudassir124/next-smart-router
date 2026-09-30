import { warnIfUninitialized } from "./dev-warn";
import { matchRouteIn } from "./route-matcher";
import { getRouteState } from "./route-registry";
import { toSegments } from "./segments";
import { applyBasePath, normalizePath, selectQuery, buildQuery } from "./url";

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
 */
export function fsBackPathSafe(pathname: string, options: FsBackOptions = {}): string {
  warnIfUninitialized("fsBackPathSafe");
  return applyBasePath(fsBackPath(pathname, options), getRouteState().config.basePath);
}

/**
 * {@link fsBackPathSafe} without `basePath` — the form `router.push` takes.
 * Next prefixes `basePath` itself, so handing it the public result would
 * navigate to `/app/app/...`.
 */
export function fsBackPath(pathname: string, options: FsBackOptions = {}): string {
  const state = getRouteState();
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

  return result + sticky;
}
