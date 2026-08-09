/**
 * Helpers for classifying Next.js App Router path segments.
 *
 *   [id]        -> dynamic            (matches exactly one segment)
 *   [...slug]   -> catch-all          (matches one or more segments)
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

/** Whether a route pattern contains any dynamic segment. */
export function isStaticRoute(route: string): boolean {
  return !route.includes("[");
}

/**
 * `decodeURIComponent` that degrades to the raw value instead of throwing.
 *
 * A truncated percent-escape (`/w/%E0%A4%A`) is reachable from any public URL;
 * throwing there takes down the render tree.
 */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* -------------------------------------------------
 * Specificity
 * ------------------------------------------------- */

/**
 * Next.js resolution order for a single segment:
 * static (0) > dynamic (1) > catch-all (2) > optional catch-all (3).
 */
export function segmentRank(seg: string): number {
  if (isOptionalCatchAll(seg)) return 3;
  if (isCatchAll(seg)) return 2;
  if (isDynamic(seg)) return 1;
  return 0;
}

/**
 * Compare two route patterns by specificity, most specific first.
 *
 * Segments are compared left to right; the first differing rank decides.
 * Ties fall back to depth, then to a stable lexical order.
 */
export function compareSpecificity(a: string, b: string): number {
  const as = toSegments(a);
  const bs = toSegments(b);
  const len = Math.min(as.length, bs.length);

  for (let i = 0; i < len; i++) {
    const d = segmentRank(as[i]) - segmentRank(bs[i]);
    if (d !== 0) return d;
  }

  if (as.length !== bs.length) return as.length - bs.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Title-case a raw path segment: "billing-plan" -> "Billing Plan". */
export function titleCase(segment: string): string {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sentence-case a raw path segment: "billing-plan" -> "Billing plan". */
export function sentenceCase(segment: string): string {
  const text = segment.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
