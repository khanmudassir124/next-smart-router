"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import type {
  InferParserMap,
  Parser,
  ParserMap,
  ParserOptions,
  SearchParamsDefinition,
} from "../core/parsers";
import { emitNavigation } from "../core/events";
import { applyShallowUrl, useLocationSearch } from "./use-location";

export interface QueryStateOptions extends ParserOptions {}

type Updater<T> = T | ((previous: T) => T);

/* -------------------------------------------------
 * Shared write path
 * ------------------------------------------------- */

interface PendingWrite {
  patch: Record<string, string | null>;
  options: ParserOptions;
}

function serializeSearch(
  current: string,
  patch: Record<string, string | null>
): string {
  const params = new URLSearchParams(current);

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }

  // Stable ordering keeps two URLs holding the same state string-equal.
  const entries = [...params.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  const next = new URLSearchParams();
  for (const [key, value] of entries) next.append(key, value);

  return next.toString();
}

function useQueryWriter() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const pending = useRef<PendingWrite | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const flush = useCallback(() => {
    const write = pending.current;
    pending.current = null;
    timer.current = null;
    if (!write) return;

    const currentSearch =
      typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    const nextSearch = serializeSearch(currentSearch, write.patch);
    if (nextSearch === currentSearch) return; // no-op — don't touch history

    const href = pathname + (nextSearch ? `?${nextSearch}` : "") + hash;
    const from = pathname + (currentSearch ? `?${currentSearch}` : "");
    const mode = write.options.history === "push" ? "push" : "replace";

    if (write.options.shallow) {
      applyShallowUrl(href, mode);
    } else if (mode === "push") {
      router.push(href, { scroll: write.options.scroll ?? false });
    } else {
      router.replace(href, { scroll: write.options.scroll ?? false });
    }

    emitNavigation({
      type: "query",
      from,
      to: href,
      shallow: write.options.shallow ?? false,
    });
  }, [pathname, router]);

  return useCallback(
    (patch: Record<string, string | null>, options: ParserOptions) => {
      pending.current = {
        patch: { ...pending.current?.patch, ...patch },
        options: { ...pending.current?.options, ...options },
      };

      const throttleMs = options.throttleMs ?? 0;

      if (timer.current) clearTimeout(timer.current);
      if (throttleMs > 0) {
        timer.current = setTimeout(flush, throttleMs);
      } else {
        // Coalesce synchronous setter calls in one tick into a single write.
        timer.current = setTimeout(flush, 0);
      }
    },
    [flush]
  );
}

/* -------------------------------------------------
 * useQueryState
 * ------------------------------------------------- */

/**
 * A single query param, read and written like `useState`.
 *
 * @example
 * const [page, setPage] = useQueryState("page", parseAsInt.default(1));
 * setPage(3);      // → ?page=3
 * setPage(null);   // → removes the key
 */
export function useQueryState<T>(
  key: string,
  parser: Parser<T, true>,
  options?: QueryStateOptions
): [T, (value: Updater<T> | null, options?: QueryStateOptions) => void];
export function useQueryState<T>(
  key: string,
  parser: Parser<T, false>,
  options?: QueryStateOptions
): [T | null, (value: Updater<T | null> | null, options?: QueryStateOptions) => void];
export function useQueryState<T>(
  key: string,
  parser: Parser<T, any>,
  options: QueryStateOptions = {}
): [T | null, (value: any, options?: QueryStateOptions) => void] {
  const search = useLocationSearch();
  const write = useQueryWriter();

  const value = useMemo(() => {
    const raw = new URLSearchParams(search).get(key);
    const parsed = raw === null ? null : parser.parse(raw);
    return parsed ?? parser.defaultValue ?? null;
    // `parser` identity is stable for module-level parsers; `search` drives it.
  }, [search, key, parser]);

  const valueRef = useRef(value);
  valueRef.current = value;

  const setValue = useCallback(
    (next: any, callOptions: QueryStateOptions = {}) => {
      const resolved = typeof next === "function" ? next(valueRef.current) : next;

      const merged: ParserOptions = {
        ...parser.options,
        ...options,
        ...callOptions,
      };

      if (resolved === null || resolved === undefined) {
        write({ [key]: null }, merged);
        return;
      }

      // Skip a write that would not change anything.
      if (valueRef.current !== null && parser.eq(resolved, valueRef.current as T)) {
        return;
      }

      const isDefault =
        parser.defaultValue !== undefined && parser.eq(resolved, parser.defaultValue);

      write(
        {
          [key]: isDefault && merged.clearOnDefault ? null : parser.serialize(resolved),
        },
        merged
      );
    },
    [key, options, parser, write]
  );

  return [value, setValue];
}

/* -------------------------------------------------
 * useQueryStates
 * ------------------------------------------------- */

/**
 * Several query params at once, written in a single navigation.
 *
 * Setting three params through three `useQueryState` setters would fire three
 * navigations and render two wrong intermediate states; this batches them.
 *
 * @example
 * const [filters, setFilters] = useQueryStates({
 *   tab: parseAsEnum(["overview", "members"]).default("overview"),
 *   page: parseAsInt.default(1),
 * });
 * setFilters({ tab: "members", page: 1 });   // one navigation
 */
export function useQueryStates<M extends ParserMap>(
  parsers: M | SearchParamsDefinition<M>,
  options: QueryStateOptions = {}
): [
  InferParserMap<M>,
  (
    values:
      | Partial<InferParserMap<M>>
      | ((prev: InferParserMap<M>) => Partial<InferParserMap<M>>),
    options?: QueryStateOptions
  ) => void,
] {
  const map = ("parsers" in parsers ? parsers.parsers : parsers) as M;
  const search = useLocationSearch();
  const write = useQueryWriter();

  const values = useMemo(() => {
    const params = new URLSearchParams(search);
    const out = {} as InferParserMap<M>;

    for (const key of Object.keys(map)) {
      const parser = map[key];
      const raw = params.get(key);
      const parsed = raw === null ? null : parser.parse(raw);
      (out as any)[key] = parsed ?? parser.defaultValue ?? null;
    }
    return out;
  }, [search, map]);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const setValues = useCallback(
    (next: any, callOptions: QueryStateOptions = {}) => {
      const resolved = typeof next === "function" ? next(valuesRef.current) : next;

      const patch: Record<string, string | null> = {};
      let merged: ParserOptions = { ...options, ...callOptions };

      for (const key of Object.keys(resolved)) {
        const parser = map[key];
        if (!parser) continue;

        merged = { ...parser.options, ...merged };
        const value = resolved[key];

        if (value === null || value === undefined) {
          patch[key] = null;
          continue;
        }

        const isDefault =
          parser.defaultValue !== undefined && parser.eq(value, parser.defaultValue);

        patch[key] =
          isDefault && merged.clearOnDefault ? null : parser.serialize(value);
      }

      if (Object.keys(patch).length) write(patch, merged);
    },
    [map, options, write]
  );

  return [values, setValues];
}

/** The current search params as a plain object, updating on shallow writes too. */
export function useSearchParamsObject(): Record<string, string> {
  const search = useLocationSearch();
  return useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search]);
}
