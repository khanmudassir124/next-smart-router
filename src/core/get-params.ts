import { getRouteState } from "./route-registry";
import { warnIfUninitialized } from "./dev-warn";
import { matchPatternParams, type ParamValue, type RouteParams } from "./route-matcher";
import { normalizePath } from "./url";
import type { Route } from "./typed-routes";
import type { ParamsOf } from "./typed-routes";

export type { ParamValue, RouteParams };

export type ParamsFromKeys<
  T extends readonly string[],
  TResult extends Partial<Record<T[number], any>> = {},
> = {
  [K in T[number]]: K extends keyof TResult ? TResult[K] : string;
};

export type Coercers = Record<string, (value: string | string[]) => any>;

/** Anything implementing the Standard Schema spec (Zod 3.24+, Valibot, ArkType). */
export interface StandardSchemaLike<TOut = unknown> {
  "~standard": {
    validate: (
      value: unknown
    ) =>
      | { value: TOut; issues?: undefined }
      | { issues: readonly { message: string; path?: readonly unknown[] }[] };
  };
}

export interface GetParamsOptions {
  /** Per-key coercion functions applied to the matched raw value. */
  coerce?: Coercers;
  /** Keys that must be present after matching — throws if missing. */
  assert?: readonly string[];
  /** Override the pathname to match against (required on the server). */
  pathname?: string;
  /** Validate and transform the whole param object. */
  schema?: StandardSchemaLike;
}

export class SmartRouterParamError extends Error {
  readonly issues: readonly { message: string; path?: readonly unknown[] }[];

  constructor(
    message: string,
    issues: readonly { message: string; path?: readonly unknown[] }[] = []
  ) {
    super(`next-smart-router: ${message}`);
    this.name = "SmartRouterParamError";
    this.issues = issues;
  }
}

function currentPathname(): string {
  if (typeof window !== "undefined") return window.location.pathname;
  throw new SmartRouterParamError("`pathname` is required in non-browser environments");
}

function applyOptions(params: RouteParams, options: GetParamsOptions | undefined): any {
  if (!options) return params;

  if (options.coerce) {
    for (const key of Object.keys(options.coerce)) {
      if (key in params && params[key] !== undefined) {
        params[key] = options.coerce[key](params[key] as string | string[]);
      }
    }
  }

  if (options.assert) {
    for (const key of options.assert) {
      if (params[key] === undefined) {
        throw new SmartRouterParamError(`missing required param "${key}"`);
      }
    }
  }

  if (options.schema) {
    const result = options.schema["~standard"].validate(params);
    if (result.issues) {
      throw new SmartRouterParamError(
        `params failed validation: ${result.issues.map((i) => i.message).join(", ")}`,
        result.issues
      );
    }
    return result.value;
  }

  return params;
}

/**
 * Extract dynamic route params for a pathname.
 *
 * Two call styles:
 *
 * @example Untyped — matches against every known route, most specific first.
 * const { id, path } = getParams<["id", "path"]>();
 *
 * @example Typed — params are inferred from the route literal, and a typo in
 * the pattern is a compile error rather than a runtime `undefined`.
 * const { id, slug } = getParams("/w/[id]/docs/[...slug]");
 * //      ^? string  ^? string[]
 */
export function getParams<R extends Route>(
  route: R,
  options?: GetParamsOptions
): ParamsOf<R>;
export function getParams<
  TKeys extends readonly string[] | undefined = undefined,
  TResult extends Partial<Record<string, any>> = {},
>(
  options?: GetParamsOptions
): TKeys extends readonly string[]
  ? ParamsFromKeys<TKeys, TResult>
  : Record<string, ParamValue>;
export function getParams(
  routeOrOptions?: string | GetParamsOptions,
  maybeOptions?: GetParamsOptions
): any {
  const route = typeof routeOrOptions === "string" ? routeOrOptions : undefined;
  const options = typeof routeOrOptions === "string" ? maybeOptions : routeOrOptions;

  if (!route) warnIfUninitialized("getParams");

  const state = getRouteState();
  const pathname = normalizePath(options?.pathname ?? currentPathname(), state.config);

  // Typed form: match the one pattern the caller named.
  if (route) {
    const params = matchPatternParams(pathname, route);
    if (!params) return applyOptions({}, options);
    return applyOptions(params, options);
  }

  // Untyped form: most specific registered route wins.
  for (const candidate of state.ordered) {
    const params = matchPatternParams(pathname, candidate);
    if (params) return applyOptions(params, options);
  }

  return applyOptions({}, options);
}
