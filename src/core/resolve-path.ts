import { toSegments } from "./segments";
import { splitUrl } from "./url";

/**
 * Resolve `target` against `current` like a Unix filesystem path, preserving
 * query strings and hashes on both sides.
 *
 *   resolvePath("/a/b/c", "../x")      -> "/a/b/x"
 *   resolvePath("/a/b/c", "./x")       -> "/a/b/c/x"
 *   resolvePath("/a/b/c", "/x")        -> "/x"          (absolute)
 *   resolvePath("/a/b?q=1", "./x")     -> "/a/b/x"      (query dropped)
 *   resolvePath("/a/b/c", "../x?q=1")  -> "/a/b/x?q=1"
 *   resolvePath("/a/b", "?q=1")        -> "/a/b?q=1"    (query-only target)
 *   resolvePath("/a/b", "#top")        -> "/a/b#top"    (hash-only target)
 *
 * `.` keeps the current directory, `..` goes up one segment. Walking above the
 * root clamps at "/" rather than producing a path with leading "..".
 */
export function resolvePath(current: string, target: string): string {
  const from = splitUrl(current);
  const to = splitUrl(target);

  // A query- or hash-only target keeps the current path.
  if (to.path === "") {
    return from.path + (to.query || "") + (to.hash || "");
  }

  // Absolute target — its own query and hash come along, the current ones don't.
  if (to.path.startsWith("/")) {
    return to.path + to.query + to.hash;
  }

  const parts = toSegments(from.path);

  for (const part of toSegments(to.path)) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }

  return "/" + parts.join("/") + to.query + to.hash;
}

/**
 * Resolve a path `levels` directories above `current`, clamping at the root.
 * Query and hash are dropped, since they belong to the page being left.
 */
export function resolveUp(current: string, levels = 1): string {
  const parts = toSegments(splitUrl(current).path);
  for (let i = 0; i < levels; i++) parts.pop();
  return "/" + parts.join("/");
}
