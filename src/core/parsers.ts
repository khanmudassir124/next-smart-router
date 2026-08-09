/**
 * Parsers turn a query string value into a typed value and back.
 *
 * Two rules hold for every parser in this file:
 *
 *  1. `parse` never throws. Malformed input falls back to the default — a
 *     hand-edited URL should degrade, not white-screen the app.
 *  2. `serialize` is the exact inverse of `parse` for every value `parse` can
 *     produce, so a round-trip through the URL is lossless.
 */

export interface ParserOptions {
  /** "replace" (default) or "push" — whether the update adds a history entry. */
  history?: "replace" | "push";
  /**
   * Update the URL via the History API instead of a router navigation.
   * Skips the server round-trip; only correct when nothing on the server
   * depends on this param.
   */
  shallow?: boolean;
  /** Coalesce rapid updates into one navigation. */
  throttleMs?: number;
  /** Scroll to top after the update. Default false. */
  scroll?: boolean;
  /** Remove the key from the URL when its value equals the default. */
  clearOnDefault?: boolean;
}

/**
 * `HasDefault` tracks whether `.default()` has been called, so that chaining
 * further modifiers does not silently widen the read type back to `T | null`.
 */
export interface Parser<T, HasDefault extends boolean = boolean> {
  parse: (raw: string) => T | null;
  serialize: (value: T) => string;
  /** Equality test used to skip no-op navigations. Default `Object.is`. */
  eq: (a: T, b: T) => boolean;
  /** Value used when the key is absent, or when parsing fails. */
  defaultValue: HasDefault extends true ? T : T | undefined;
  options: ParserOptions;

  default(value: T): Parser<T, true>;
  clearOnDefault(enabled?: boolean): Parser<T, HasDefault>;
  withOptions(options: ParserOptions): Parser<T, HasDefault>;
  withEq(eq: (a: T, b: T) => boolean): Parser<T, HasDefault>;
}

export interface ParserSpec<T> {
  parse: (raw: string) => T | null;
  serialize: (value: T) => string;
  eq?: (a: T, b: T) => boolean;
}

/** Build a parser from a parse/serialize pair. */
export function createParser<T>(spec: ParserSpec<T>): Parser<T, false> {
  const make = (
    defaultValue: T | undefined,
    options: ParserOptions,
    eq: (a: T, b: T) => boolean
  ): any => {
    const parser = {
      parse: (raw: string): T | null => {
        try {
          const value = spec.parse(raw);
          return value === null || value === undefined ? null : value;
        } catch {
          return null;
        }
      },
      serialize: spec.serialize,
      eq,
      defaultValue,
      options,
      default: (value: T) => make(value, options, eq) as Parser<T, true>,
      clearOnDefault: (enabled = true) =>
        make(defaultValue, { ...options, clearOnDefault: enabled }, eq),
      withOptions: (next: ParserOptions) =>
        make(defaultValue, { ...options, ...next }, eq),
      withEq: (nextEq: (a: T, b: T) => boolean) => make(defaultValue, options, nextEq),
    };
    return parser;
  };

  return make(undefined, {}, spec.eq ?? ((a, b) => Object.is(a, b)));
}

/* -------------------------------------------------
 * Built-ins
 * ------------------------------------------------- */

export const parseAsString: Parser<string, false> = createParser({
  parse: (raw) => raw,
  serialize: (value) => value,
});

export const parseAsInt: Parser<number, false> = createParser({
  parse: (raw) => {
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  },
  serialize: (value) => String(Math.trunc(value)),
});

export const parseAsFloat: Parser<number, false> = createParser({
  parse: (raw) => {
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  },
  serialize: (value) => String(value),
});

/**
 * Boolean, with the flag-style spellings people actually type.
 * Note `Boolean("false")` is `true`, which is why this exists.
 */
export const parseAsBoolean: Parser<boolean, false> = createParser({
  parse: (raw) => {
    const value = raw.toLowerCase();
    if (value === "" || value === "1" || value === "true" || value === "yes")
      return true;
    if (value === "0" || value === "false" || value === "no") return false;
    return null;
  },
  serialize: (value) => (value ? "true" : "false"),
});

export const parseAsIsoDate: Parser<Date, false> = createParser({
  parse: (raw) => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  serialize: (value) => value.toISOString(),
  eq: (a, b) => a.getTime() === b.getTime(),
});

/** A date without a time component, serialized as `YYYY-MM-DD`. */
export const parseAsDateOnly: Parser<Date, false> = createParser({
  parse: (raw) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  serialize: (value) => value.toISOString().slice(0, 10),
  eq: (a, b) => a.getTime() === b.getTime(),
});

export function parseAsEnum<const T extends readonly string[]>(
  values: T
): Parser<T[number], false> {
  return createParser<T[number]>({
    parse: (raw) => (values.includes(raw) ? (raw as T[number]) : null),
    serialize: (value) => value,
  });
}

export function parseAsArrayOf<T>(
  parser: Parser<T>,
  options: { separator?: string } = {}
): Parser<T[], false> {
  const separator = options.separator ?? ",";

  return createParser<T[]>({
    parse: (raw) => {
      if (raw === "") return [];
      const parsed = raw
        .split(separator)
        .map((part) => parser.parse(part.trim()))
        .filter((value): value is T => value !== null);
      return parsed;
    },
    serialize: (value) => value.map((item) => parser.serialize(item)).join(separator),
    eq: (a, b) => a.length === b.length && a.every((item, i) => parser.eq(item, b[i])),
  });
}

/** A JSON object, base64url-encoded so it survives every URL context. */
export function parseAsJson<T>(validate?: (value: unknown) => T): Parser<T, false> {
  return createParser<T>({
    parse: (raw) => {
      const json = fromBase64Url(raw);
      if (json === null) return null;
      const value = JSON.parse(json) as unknown;
      return validate ? validate(value) : (value as T);
    },
    serialize: (value) => toBase64Url(JSON.stringify(value)),
    eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
}

export interface SortOrder {
  field: string;
  dir: "asc" | "desc";
}

/** `"createdAt:desc"` <-> `{ field: "createdAt", dir: "desc" }`. */
export const parseAsSortOrder: Parser<SortOrder, false> = createParser({
  parse: (raw) => {
    const [field, dir = "asc"] = raw.split(":");
    if (!field) return null;
    if (dir !== "asc" && dir !== "desc") return null;
    return { field, dir };
  },
  serialize: (value) => `${value.field}:${value.dir}`,
  eq: (a, b) => a.field === b.field && a.dir === b.dir,
});

/* -------------------------------------------------
 * base64url, without a Buffer/atob split-brain
 * ------------------------------------------------- */

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(input, "utf8").toString("base64");

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    if (typeof atob === "function") {
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/* -------------------------------------------------
 * Search-param definitions
 * ------------------------------------------------- */

export type ParserMap = Record<string, Parser<any, any>>;

export type InferParserMap<M extends ParserMap> = {
  [K in keyof M]: M[K] extends Parser<infer T, true>
    ? T
    : M[K] extends Parser<infer T, any>
      ? T | null
      : never;
};

export interface SearchParamsDefinition<M extends ParserMap> {
  parsers: M;
  /**
   * Parse a raw search-param bag — Next's `searchParams` page prop, a
   * `URLSearchParams`, or a plain object — into typed values.
   */
  parse(
    input: URLSearchParams | Record<string, string | string[] | undefined> | string
  ): InferParserMap<M>;
  /** Serialize typed values into a query string, including the leading "?". */
  serialize(values: Partial<InferParserMap<M>>): string;
  /** Build an href for a route with these search params applied. */
  href(path: string, values: Partial<InferParserMap<M>>): string;
}

function readRaw(
  input: URLSearchParams | Record<string, string | string[] | undefined> | string,
  key: string
): string | undefined {
  if (typeof input === "string") {
    const params = new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
    return params.get(key) ?? undefined;
  }
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;

  const value = input[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Declare a route's search params once, and read them the same way on the
 * server (page props) and the client (`useQueryStates`).
 *
 * @example
 * export const workspaceSearch = defineSearchParams({
 *   tab: parseAsEnum(["overview", "members"]).default("overview"),
 *   page: parseAsInt.default(1),
 * });
 */
export function defineSearchParams<M extends ParserMap>(
  parsers: M
): SearchParamsDefinition<M> {
  return {
    parsers,

    parse(input) {
      const out = {} as InferParserMap<M>;

      for (const key of Object.keys(parsers)) {
        const parser = parsers[key];
        const raw = readRaw(input, key);
        const parsed = raw === undefined ? null : parser.parse(raw);
        (out as any)[key] = parsed ?? parser.defaultValue ?? null;
      }

      return out;
    },

    serialize(values) {
      const params = new URLSearchParams();

      for (const key of Object.keys(parsers).sort()) {
        const parser = parsers[key];
        const value = (values as any)[key];
        if (value === undefined || value === null) continue;

        const isDefault =
          parser.defaultValue !== undefined && parser.eq(value, parser.defaultValue);
        if (isDefault && parser.options.clearOnDefault) continue;

        params.set(key, parser.serialize(value));
      }

      const serialized = params.toString();
      return serialized ? `?${serialized}` : "";
    },

    href(path, values) {
      return path + this.serialize(values);
    },
  };
}
