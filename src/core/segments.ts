/**
 * Helpers for classifying Next.js App Router path segments.
 *
 *   [id]        -> dynamic          (matches exactly one segment)
 *   [...slug]   -> catch-all        (matches one or more segments)
 *   [[...slug]] -> optional catch-all (matches zero or more segments)
 */

export function isOptionalCatchAll(seg: string): boolean {
  return seg.startsWith("[[...") && seg.endsWith("]]");
}

export function isCatchAll(seg: string): boolean {
  return !isOptionalCatchAll(seg) && seg.startsWith("[...") && seg.endsWith("]");
}

export function isDynamic(seg: string): boolean {
  return seg.startsWith("[") && seg.endsWith("]");
}

/** Extract the bare param name from a dynamic/catch-all segment. */
export function getParamName(seg: string): string {
  return seg.replace(/\[|\]|\.\.\./g, "");
}

/** Split a path into non-empty segments. */
export function toSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}
