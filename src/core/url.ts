/**
 * URL string surgery: splitting, query manipulation, and normalization.
 *
 * Everything here is pure and dependency-free, so it works identically in
 * Server Components, Route Handlers, `middleware.ts`, tests and the browser.
 */

import { toSegments } from "./segments";

export type QueryValue =
  string | number | boolean | null | undefined | Array<string | number | boolean>;
export type QueryInput = Record<string, QueryValue>;
export type ParsedQuery = Record<string, string | string[]>;

export interface UrlParts {
  /** Pathname, without query or hash. */
  path: string;
  /** Query including the leading "?", or "". */
  query: string;
  /** Hash including the leading "#", or "". */
  hash: string;
}

/** How array values are encoded when serializing a query. */
export type ArrayFormat = "repeat" | "comma";

export interface QueryOptions {
  /** `repeat` -> `?t=a&t=b` (default), `comma` -> `?t=a,b`. */
  arrayFormat?: ArrayFormat;
  /**
   * Sort keys before serializing. Default `true` — makes two hrefs holding the
   * same state compare equal, which matters for prefetch and cache keys.
   */
  sort?: boolean;
}

/** Split a URL-ish string into path / query / hash. */
export function splitUrl(url: string): UrlParts {
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const rest = hashAt === -1 ? url : url.slice(0, hashAt);

  const queryAt = rest.indexOf("?");
  const query = queryAt === -1 ? "" : rest.slice(queryAt);
  const path = queryAt === -1 ? rest : rest.slice(0, queryAt);

  return { path, query, hash };
}

/** Strip query and hash, returning just the pathname. */
export function toPathname(url: string): string {
  return splitUrl(url).path;
}

/** Parse a query string (with or without "?") into an object. */
export function parseQuery(url: string): ParsedQuery {
  const query = url.includes("?") ? splitUrl(url).query : url;
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const out: ParsedQuery = {};

  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

function appendValue(
  params: URLSearchParams,
  key: string,
  value: QueryValue,
  arrayFormat: ArrayFormat
): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    if (value.length === 0) return;
    if (arrayFormat === "comma") {
      params.append(key, value.map(String).join(","));
    } else {
      for (const item of value) params.append(key, String(item));
    }
    return;
  }

  params.append(key, String(value));
}

/** Serialize an object into a query string, including the leading "?" (or ""). */
export function buildQuery(
  input: QueryInput | undefined,
  options: QueryOptions = {}
): string {
  if (!input) return "";

  const { arrayFormat = "repeat", sort = true } = options;
  const params = new URLSearchParams();
  const keys = Object.keys(input);

  for (const key of sort ? [...keys].sort() : keys) {
    appendValue(params, key, input[key], arrayFormat);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * Merge `patch` into the query of `url`.
 *
 * A value of `undefined` or `null` deletes the key, which is how you clear a
 * filter without rebuilding the whole query by hand.
 *
 *   withQuery("/w/42?tab=a&sort=x", { sort: "y", page: undefined })
 *   -> "/w/42?sort=y&tab=a"
 */
export function withQuery(
  url: string,
  patch: QueryInput,
  options: QueryOptions = {}
): string {
  const { path, query, hash } = splitUrl(url);
  const merged: QueryInput = { ...parseQuery(query) };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete merged[key];
    else merged[key] = value;
  }

  return path + buildQuery(merged, options) + hash;
}

/** Replace the query of `url` entirely. */
export function setQuery(
  url: string,
  next: QueryInput,
  options: QueryOptions = {}
): string {
  const { path, hash } = splitUrl(url);
  return path + buildQuery(next, options) + hash;
}

type KeyMatcher = string | RegExp;

function matchesAny(key: string, matchers: readonly KeyMatcher[]): boolean {
  return matchers.some((m) => (typeof m === "string" ? m === key : m.test(key)));
}

/** Keep only the listed query keys (strings or regexes). */
export function pickQuery(
  url: string,
  keys: readonly KeyMatcher[],
  options: QueryOptions = {}
): string {
  const { path, query, hash } = splitUrl(url);
  const parsed = parseQuery(query);
  const kept: QueryInput = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (matchesAny(key, keys)) kept[key] = value;
  }

  return path + buildQuery(kept, options) + hash;
}

/** Remove the listed query keys (strings or regexes). */
export function omitQuery(
  url: string,
  keys: readonly KeyMatcher[],
  options: QueryOptions = {}
): string {
  const { path, query, hash } = splitUrl(url);
  const parsed = parseQuery(query);
  const kept: QueryInput = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!matchesAny(key, keys)) kept[key] = value;
  }

  return path + buildQuery(kept, options) + hash;
}

/** Merge two URLs' queries, with the right-hand side winning. */
export function mergeQuery(
  url: string,
  other: string,
  options: QueryOptions = {}
): string {
  return withQuery(url, parseQuery(other), options);
}

/** Extract the query keys of `url` that match `keys`, as a plain object. */
export function selectQuery(url: string, keys: readonly KeyMatcher[]): ParsedQuery {
  const parsed = parseQuery(splitUrl(url).query);
  const out: ParsedQuery = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (matchesAny(key, keys)) out[key] = value;
  }
  return out;
}

/**
 * Carry `carried` params onto `to`. Keys already on `to` win, and repeated
 * keys (`?tag=a&tag=b`) survive — `Object.fromEntries` would keep only the last.
 *
 *   carryQuery("/w?tag=a&tag=b", { locale: "fr" }) -> "/w?locale=fr&tag=a&tag=b"
 */
export function carryQuery(to: string, carried: ParsedQuery): string {
  const { path, query, hash } = splitUrl(to);
  return path + buildQuery({ ...carried, ...parseQuery(query) }) + hash;
}

/* -------------------------------------------------
 * Path normalization
 * ------------------------------------------------- */

export interface NormalizeOptions {
  /** Next.js `basePath`, stripped before matching. */
  basePath?: string;
  /** Locale prefixes to strip, e.g. ["en", "fr"]. */
  locales?: readonly string[];
}

/**
 * Reduce an arbitrary URL to a bare, comparable pathname: query and hash
 * removed, `basePath` and locale prefix stripped, slashes collapsed, no
 * trailing slash (except for the root).
 */
export function normalizePath(url: string, options: NormalizeOptions = {}): string {
  let path = splitUrl(url).path;

  const base = options.basePath ? stripTrailingSlash(options.basePath) : "";
  if (base && (path === base || path.startsWith(base + "/"))) {
    path = path.slice(base.length);
  }

  const segments = toSegments(path);

  if (
    options.locales?.length &&
    segments.length &&
    options.locales.includes(segments[0])
  ) {
    segments.shift();
  }

  return "/" + segments.join("/");
}

/** Re-apply `basePath` to an internal path produced by the library. */
export function applyBasePath(path: string, basePath?: string): string {
  const base = basePath ? stripTrailingSlash(basePath) : "";
  if (!base) return path;

  const { path: bare, query, hash } = splitUrl(path);
  if (bare === base || bare.startsWith(base + "/")) return path;

  const prefixed = base + (bare === "/" ? "" : bare);
  return (prefixed || "/") + query + hash;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/** Add or remove a trailing slash to match a `trailingSlash` config. */
export function applyTrailingSlash(url: string, trailingSlash?: boolean): string {
  if (!trailingSlash) return url;

  const { path, query, hash } = splitUrl(url);
  if (path === "/" || path.endsWith("/")) return url;
  return path + "/" + query + hash;
}
