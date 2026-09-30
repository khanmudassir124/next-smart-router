import { getConfig } from "./config";
import {
  getParamName,
  isCatchAll,
  isDynamic,
  isOptionalCatchAll,
  toSegments,
} from "./segments";
import type { BuildParamsOf, Route } from "./typed-routes";
import { buildQuery, toUrlPath, type ArrayFormat, type QueryInput } from "./url";

export class SmartRouterHrefError extends Error {
  constructor(message: string) {
    super(`next-smart-router: ${message}`);
    this.name = "SmartRouterHrefError";
  }
}

export interface BuildHrefOptions {
  /** Query params appended to the built path. `undefined` values are dropped. */
  query?: QueryInput;
  /** Fragment, with or without a leading "#". */
  hash?: string;
  /** How array query values are encoded. Default "repeat". */
  arrayFormat?: ArrayFormat;
  /** Skip applying `basePath` / `trailingSlash` from the global config. */
  raw?: boolean;
}

/**
 * Fill a route pattern with params to produce a concrete, encoded href.
 *
 *   buildHref("/w/[id]/docs/[...slug]", { id: 42, slug: ["a b", "c"] })
 *   -> "/w/42/docs/a%20b/c"
 *
 *   buildHref("/w/[id]", { id: 7 }, { query: { tab: "members" } })
 *   -> "/w/7?tab=members"
 *
 *   buildHref("/files/[[...path]]", {})
 *   -> "/files"
 *
 * Every segment is `encodeURIComponent`'d, so a param containing "/", "?" or
 * "#" cannot break out of its slot. Missing required params throw rather than
 * producing a URL with the literal "[id]" in it.
 */
export function buildHref<R extends Route>(
  route: R,
  params: BuildParamsOf<R>,
  options: BuildHrefOptions = {}
): string {
  const values = (params ?? {}) as Record<string, unknown>;
  const out: string[] = [];

  const segments = toSegments(route);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (isOptionalCatchAll(seg) || isCatchAll(seg)) {
      if (i !== segments.length - 1) {
        throw new SmartRouterHrefError(
          `catch-all segment "${seg}" must be last in "${route}"`
        );
      }

      const name = getParamName(seg);
      const value = values[name];
      const list =
        value === undefined || value === null
          ? []
          : Array.isArray(value)
            ? value
            : [value];

      if (list.length === 0) {
        if (isCatchAll(seg)) {
          throw new SmartRouterHrefError(
            `"${route}" requires at least one segment for [...${name}]`
          );
        }
        continue; // an optional catch-all may be empty
      }

      out.push(...list.map((v) => encodeURIComponent(String(v))));
      continue;
    }

    if (isDynamic(seg)) {
      const name = getParamName(seg);
      const value = values[name];

      if (value === undefined || value === null || value === "") {
        throw new SmartRouterHrefError(`missing param "${name}" for "${route}"`);
      }
      if (Array.isArray(value)) {
        throw new SmartRouterHrefError(
          `param "${name}" for "${route}" is a single segment, got an array`
        );
      }

      out.push(encodeURIComponent(String(value)));
      continue;
    }

    out.push(seg);
  }

  const path = "/" + out.join("/");
  const query = buildQuery(options.query, { arrayFormat: options.arrayFormat });
  const hash = options.hash
    ? options.hash.startsWith("#")
      ? options.hash
      : `#${options.hash}`
    : "";

  if (options.raw) return path + query + hash;

  return toUrlPath(path + query + hash, getConfig());
}

/**
 * Like {@link buildHref} but returns `null` instead of throwing when params
 * are missing — useful when rendering a link whose data may not have loaded.
 */
export function tryBuildHref<R extends Route>(
  route: R,
  params: BuildParamsOf<R>,
  options: BuildHrefOptions = {}
): string | null {
  try {
    return buildHref(route, params, options);
  } catch (error) {
    if (error instanceof SmartRouterHrefError) return null;
    throw error;
  }
}
