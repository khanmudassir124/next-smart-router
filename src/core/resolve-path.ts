import { toSegments } from "./segments";

/**
 * Resolve `target` against `current` like a Unix filesystem path.
 *
 *   resolvePath("/a/b/c", "../x")  -> "/a/b/x"
 *   resolvePath("/a/b/c", "./x")   -> "/a/b/c/x"
 *   resolvePath("/a/b/c", "/x")    -> "/x"      (absolute)
 *
 * `.` keeps the current directory, `..` goes up one segment.
 */
export function resolvePath(current: string, target: string): string {
  // Absolute target — return as-is.
  if (target.startsWith("/")) return target;

  const currentParts = toSegments(current);
  const targetParts = toSegments(target);

  for (const part of targetParts) {
    if (part === "..") {
      currentParts.pop();
    } else if (part !== ".") {
      currentParts.push(part);
    }
  }

  return "/" + currentParts.join("/");
}
