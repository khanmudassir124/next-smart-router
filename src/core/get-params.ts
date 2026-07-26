import { getRoutes } from "./route-registry";
import {
  getParamName,
  isCatchAll,
  isDynamic,
  isOptionalCatchAll,
  toSegments,
} from "./segments";

/* -------------------------------------------------
 * Types
 * ------------------------------------------------- */

export type ParamValue = string | string[] | undefined;

export type ParamsFromKeys<
  T extends readonly string[],
  TResult extends Partial<Record<T[number], any>> = {}
> = {
  [K in T[number]]: K extends keyof TResult ? TResult[K] : string;
};

export type Coercers = Record<string, (value: string | string[]) => any>;

export interface GetParamsOptions {
  /** Per-key coercion functions applied to the matched raw value. */
  coerce?: Coercers;
  /** Keys that must be present after matching — throws if missing. */
  assert?: readonly string[];
  /** Override the pathname to match against (required on the server). */
  pathname?: string;
}

/* -------------------------------------------------
 * Helpers
 * ------------------------------------------------- */

function getPathname(): string {
  if (typeof window !== "undefined") {
    return window.location.pathname;
  }
  throw new Error(
    "next-smart-router: `pathname` is required in non-browser environments"
  );
}

/* -------------------------------------------------
 * getParams
 * ------------------------------------------------- */

/**
 * Extract dynamic route params for the current pathname by matching it against
 * the registered routes.
 *
 * @example
 * // route: /workspaces/[id]/docs/[...path]
 * const { id, path } = getParams<["id", "path"]>();
 * // id: "42" (string), path: ["a", "b"] (string[])
 *
 * @example
 * const { id } = getParams<["id"], { id: number }>({
 *   coerce: { id: (v) => Number(v) },
 *   assert: ["id"],
 * });
 */
export function getParams<
  TKeys extends readonly string[] | undefined = undefined,
  TResult extends Partial<Record<string, any>> = {}
>(
  options?: GetParamsOptions
): TKeys extends readonly string[]
  ? ParamsFromKeys<TKeys, TResult>
  : Record<string, ParamValue> {
  const pathname = options?.pathname ?? getPathname();
  const pathSegs = toSegments(pathname);
  const routes = getRoutes();

  for (const route of routes) {
    const routeSegs = toSegments(route);
    const params: Record<string, ParamValue> = {};

    let i = 0;
    let j = 0;
    let match = true;

    while (i < routeSegs.length) {
      const routeSeg = routeSegs[i];
      const pathSeg = pathSegs[j];

      if (isOptionalCatchAll(routeSeg)) {
        params[getParamName(routeSeg)] = pathSegs.slice(j);
        j = pathSegs.length;
        i++;
        break;
      }

      if (isCatchAll(routeSeg)) {
        if (j >= pathSegs.length) {
          match = false;
          break;
        }
        params[getParamName(routeSeg)] = pathSegs.slice(j);
        j = pathSegs.length;
        i++;
        break;
      }

      if (isDynamic(routeSeg)) {
        if (!pathSeg) {
          match = false;
          break;
        }
        params[getParamName(routeSeg)] = decodeURIComponent(pathSeg);
        i++;
        j++;
        continue;
      }

      if (routeSeg !== pathSeg) {
        match = false;
        break;
      }

      i++;
      j++;
    }

    if (!match || j < pathSegs.length) continue;

    /* Apply coercion */
    if (options?.coerce) {
      for (const key in options.coerce) {
        if (key in params) {
          params[key] = options.coerce[key](params[key] as string | string[]);
        }
      }
    }

    /* Assertions */
    if (options?.assert) {
      for (const key of options.assert) {
        if (params[key] === undefined) {
          throw new Error(`next-smart-router: missing required param "${key}"`);
        }
      }
    }

    return params as any;
  }

  return {} as any;
}
