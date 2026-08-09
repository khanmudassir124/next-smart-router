/**
 * Type-level route machinery.
 *
 * By default `Route` is `string`, so nothing is constrained and untyped
 * projects keep working. A consumer opts into typed routes by augmenting
 * `Register` with the union emitted by the CLI:
 *
 * ```ts
 * // app/smart-router.d.ts
 * import type { Route } from "@/route-manifest";
 *
 * declare module "next-smart-router" {
 *   interface Register {
 *     route: Route;
 *   }
 * }
 * ```
 *
 * From then on every `route` argument in the package is checked against the
 * real filesystem, and params are inferred from the pattern.
 */

export interface Register {}

/** The app's route union when registered, otherwise `string`. */
export type Route = Register extends { route: infer R extends string } ? R : string;

/** The app's route metadata shape when registered, otherwise a loose record. */
export type RegisteredMeta = Register extends { meta: infer M }
  ? M
  : Record<string, unknown>;

/**
 * Infer the params of a route pattern.
 *
 *   ParamsOf<"/w/[id]">                  -> { id: string }
 *   ParamsOf<"/docs/[...slug]">          -> { slug: string[] }
 *   ParamsOf<"/files/[[...path]]">       -> { path?: string[] }
 *   ParamsOf<"/w/[id]/docs/[...slug]">   -> { id: string; slug: string[] }
 *   ParamsOf<string>                     -> Record<string, ParamValue>
 */
export type ParamsOf<R extends string> = string extends R
  ? Record<string, string | string[] | undefined>
  : Simplify<ParamsOfPattern<R>>;

type ParamsOfPattern<R extends string> =
  R extends `${string}[[...${infer P}]]${infer Rest}`
    ? { [K in P]?: string[] } & ParamsOfPattern<Rest>
    : R extends `${string}[...${infer P}]${infer Rest}`
      ? { [K in P]: string[] } & ParamsOfPattern<Rest>
      : R extends `${string}[${infer P}]${infer Rest}`
        ? { [K in P]: string } & ParamsOfPattern<Rest>
        : {};

/** Flatten an intersection into a single readable object type. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Params accepted when *building* an href: numbers are allowed anywhere a
 * string param is, since they're stringified on the way out.
 */
export type BuildParamsOf<R extends string> = string extends R
  ? Record<string, string | number | Array<string | number> | undefined>
  : Simplify<BuildParamsOfPattern<R>>;

type BuildParamsOfPattern<R extends string> =
  R extends `${string}[[...${infer P}]]${infer Rest}`
    ? { [K in P]?: Array<string | number> } & BuildParamsOfPattern<Rest>
    : R extends `${string}[...${infer P}]${infer Rest}`
      ? { [K in P]: Array<string | number> } & BuildParamsOfPattern<Rest>
      : R extends `${string}[${infer P}]${infer Rest}`
        ? { [K in P]: string | number } & BuildParamsOfPattern<Rest>
        : {};

/** True when a route pattern has no dynamic segments. */
export type HasNoParams<R extends string> = keyof ParamsOfPattern<R> extends never
  ? true
  : false;
