import { getRouteState } from "./route-registry";
import { matchPatternParams } from "./route-matcher";
import { toSegments } from "./segments";
import { normalizePath } from "./url";

export interface IsActiveOptions {
  /**
   * Only the exact path counts as active. Default `false`, so a parent nav
   * item stays lit while the user is on one of its children.
   */
  exact?: boolean;
  /** Compare query params too — active only if all listed keys match. */
  matchQuery?: readonly string[];
}

/**
 * Whether `target` should be treated as the active navigation entry for
 * `pathname`.
 *
 * `target` may be a concrete href ("/w/42") or a route pattern ("/w/[id]"),
 * which is what makes it usable for a nav item that stands for a whole
 * section rather than one URL.
 *
 *   isActive("/w/42/settings", "/w")          -> true
 *   isActive("/w/42/settings", "/w", { exact: true }) -> false
 *   isActive("/w/42/settings", "/w/[id]")     -> true
 *   isActive("/w/42", "/w-archive")           -> false  (not a prefix match)
 */
export function isActive(
  pathname: string,
  target: string,
  options: IsActiveOptions = {}
): boolean {
  const config = getRouteState().config;
  const current = normalizePath(pathname, config);

  if (
    options.matchQuery?.length &&
    !queryMatches(pathname, target, options.matchQuery)
  ) {
    return false;
  }

  // Pattern form — match rather than string-compare.
  if (target.includes("[")) {
    if (matchPatternParams(current, target) !== null) return true;
    if (options.exact) return false;

    // A non-exact pattern is active when any ancestor of the current path
    // matches it, so "/w/[id]" stays lit on "/w/42/settings".
    const segs = toSegments(current);
    for (let i = segs.length - 1; i > 0; i--) {
      const ancestor = "/" + segs.slice(0, i).join("/");
      if (matchPatternParams(ancestor, target) !== null) return true;
    }
    return false;
  }

  const href = normalizePath(target, config);
  if (current === href) return true;
  if (options.exact) return false;

  return href === "/" ? false : current.startsWith(href + "/");
}

function queryMatches(
  pathname: string,
  target: string,
  keys: readonly string[]
): boolean {
  const a = new URLSearchParams(pathname.split("?")[1] ?? "");
  const b = new URLSearchParams(target.split("?")[1] ?? "");
  return keys.every((key) => a.get(key) === b.get(key));
}
