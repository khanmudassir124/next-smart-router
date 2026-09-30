import { warnIfUninitialized } from "./dev-warn";
import { matchRouteIn } from "./route-matcher";
import { getRouteState } from "./route-registry";
import { safeDecode, sentenceCase, titleCase, toSegments } from "./segments";
import type { RouteState } from "./route-state";
import { localeOf, normalizePath, withLocale } from "./url";

export interface Breadcrumb {
  /** Display text. Decoded, and formatted per `format` / `labelFor`. */
  label: string;
  href: string;
  /** The raw (decoded) path segment this crumb was built from. */
  segment: string;
  /** The route pattern this crumb matched, e.g. "/w/[id]". Empty if unmatched. */
  pattern: string;
  /** The param name, when this segment filled a dynamic slot. */
  param?: string;
  /** True for the final crumb — conventionally rendered as text, not a link. */
  isCurrent: boolean;
  /** False when no known route matches this ancestor. */
  matched: boolean;
}

export interface BreadcrumbOptions {
  /**
   * Static label overrides, keyed by href (with or without its locale prefix)
   * or by raw segment.
   */
  labels?: Record<string, string>;
  /** Full control over the label. Wins over `labels`. */
  labelFor?: (crumb: Omit<Breadcrumb, "label">) => string;
  /** Default label formatting. "raw" preserves the segment as-is. */
  format?: "raw" | "title" | "sentence";
  /** Prepend a crumb for "/". Default false. */
  includeRoot?: boolean;
  /** Label for the root crumb when `includeRoot` is set. Default "Home". */
  rootLabel?: string;
  /**
   * What to do with ancestors that match no known route.
   * "omit" (default) drops them; "text" keeps them as unlinked crumbs.
   */
  unmatched?: "omit" | "text";
}

function formatLabel(segment: string, format: BreadcrumbOptions["format"]): string {
  if (format === "title") return titleCase(segment);
  if (format === "sentence") return sentenceCase(segment);
  return segment;
}

/**
 * Build a breadcrumb trail for `pathname`.
 *
 *   getBreadcrumbs("/w/42/settings")
 *   -> [{ label: "w",        href: "/w",            pattern: "/w" },
 *       { label: "42",       href: "/w/42",         pattern: "/w/[id]", param: "id" },
 *       { label: "settings", href: "/w/42/settings", isCurrent: true }]
 *
 * Labels are URI-decoded. Pass `format` for automatic title casing, `labels`
 * for per-segment overrides (a fetched workspace name in place of its id), or
 * `labelFor` for full control.
 */
export function getBreadcrumbs(
  pathname: string,
  options: BreadcrumbOptions = {}
): Breadcrumb[] {
  warnIfUninitialized("getBreadcrumbs");
  return breadcrumbsIn(getRouteState(), pathname, options);
}

/**
 * {@link getBreadcrumbs} against an explicit state — what `createRouter` uses.
 *
 * Crumb hrefs are Next-relative: the locale is kept (the App Router adds none)
 * and `basePath` is not added, because they are made to be rendered with
 * `<Link>` / `<SmartLink>`, which add it themselves.
 */
export function breadcrumbsIn(
  state: RouteState,
  pathname: string,
  options: BreadcrumbOptions = {}
): Breadcrumb[] {
  const locale = localeOf(pathname, state.config);
  const normalized = normalizePath(pathname, state.config);
  const parts = toSegments(normalized);
  const crumbs: Breadcrumb[] = [];

  if (options.includeRoot) {
    crumbs.push({
      label: options.rootLabel ?? "Home",
      href: withLocale("/", locale),
      segment: "",
      pattern: "/",
      isCurrent: parts.length === 0,
      matched: true,
    });
  }

  for (let i = 0; i < parts.length; i++) {
    const path = "/" + parts.slice(0, i + 1).join("/");
    const href = withLocale(path, locale);
    const match = matchRouteIn(state, path);
    const matched = match !== null;

    if (!matched && options.unmatched !== "text") continue;

    const segment = safeDecode(parts[i]);
    const pattern = match?.route ?? "";
    const param = paramNameFor(pattern, i);

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
        options.labels?.[path] ??
        options.labels?.[segment] ??
        match?.meta?.title ??
        formatLabel(segment, options.format),
    });
  }

  if (crumbs.length) crumbs[crumbs.length - 1].isCurrent = true;
  return crumbs;
}

/** The param name filled by segment `index` of `pattern`, if it is dynamic. */
function paramNameFor(pattern: string, index: number): string | undefined {
  if (!pattern) return undefined;
  const seg = toSegments(pattern)[index];
  if (!seg || !seg.startsWith("[")) return undefined;
  return seg.replace(/\[|\]|\.\.\./g, "");
}
