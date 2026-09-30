"use client";

import { useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getConfig } from "../core/config";
import { emitNavigation, runGuards, type NavigationType } from "../core/events";
import { fsBackPathSafe } from "../core/fs-back";
import { resolvePath } from "../core/resolve-path";
import { routeExists } from "../core/route-matcher";
import { carryQuery, selectQuery, withQuery, type QueryInput } from "../core/url";
import { writeFlash, writeTransfer, type FlashMessage } from "../core/transfer";
import type { TransferStrategy } from "../core/config";
import { applyShallowUrl } from "./use-location";

/** The App Router instance returned by `next/navigation`'s `useRouter`. */
export type NextAppRouter = ReturnType<typeof useRouter>;

export interface NavigateOptions {
  /** Forwarded to the Next router. */
  scroll?: boolean;
  /** Query params merged into the target. `undefined` values delete a key. */
  query?: QueryInput;
  /**
   * Carry query params from the current URL.
   * `true` (default) carries the configured `stickyQuery` keys;
   * `false` carries none; an array carries exactly those keys as well.
   */
  keepQuery?: boolean | readonly string[];
  /** Data handed to the destination screen. Read there with `useRouteState`. */
  state?: unknown;
  /** Backing store for `state`, overriding the configured default. */
  strategy?: TransferStrategy;
  /** One-shot message for the destination. Read with `useFlash`. */
  flash?: FlashMessage;
  /** Update the URL via the History API, skipping the server round-trip. */
  shallow?: boolean;
}

export interface PrefetchOptions {
  kind?: "auto" | "full";
}

export interface SmartRouter {
  /** The current pathname (from `next/navigation`). */
  pathname: string;
  /**
   * The underlying `next/navigation` router, untouched. Use this for anything
   * next-smart-router doesn't wrap.
   */
  router: NextAppRouter;

  /** Navigate to `target`, resolved relative to the current path. */
  push: (target: string, options?: NavigateOptions) => void;
  /** Replace with `target`, resolved relative to the current path. */
  replace: (target: string, options?: NavigateOptions) => void;
  /** Browser history back. */
  back: () => void;
  /** Browser history forward. */
  forward: () => void;
  /** Refresh the current route. */
  refresh: () => void;
  /** Prefetch a route, resolved relative to the current path. */
  prefetch: (target: string, options?: PrefetchOptions) => void;

  /** Navigate to the nearest existing ancestor route (never a 404). */
  fsBack: (options?: NavigateOptions) => void;
  /** Alias of {@link fsBack}. */
  pop: (options?: NavigateOptions) => void;
  /** Walk up `levels` directories, landing on the nearest existing route. */
  up: (levels?: number, options?: NavigateOptions) => void;
  /** Navigate to a sibling of the current path. */
  sibling: (name: string, options?: NavigateOptions) => void;
  /** Navigate to a child of the current path. */
  child: (name: string, options?: NavigateOptions) => void;
  /** Navigate to the root. */
  root: (options?: NavigateOptions) => void;

  /** Whether a relative or absolute target matches a known route. */
  canNavigate: (target: string) => boolean;
  /** Navigate only if the target exists, otherwise use `fallback`. */
  pushIfExists: (
    target: string,
    options?: NavigateOptions & { fallback?: string }
  ) => boolean;

  /** Resolve a relative target against the current path without navigating. */
  resolve: (target: string) => string;
  /** Merge query params into the current URL. */
  setQuery: (patch: QueryInput, options?: NavigateOptions) => void;
}

function readCurrentHref(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  return pathname + window.location.search + window.location.hash;
}

/**
 * A drop-in wrapper around `next/navigation`'s router that understands
 * relative, filesystem-style paths (`./x`, `../x`), carries sticky query
 * params, can hand data to the destination screen, and can safely walk up to
 * the nearest existing route.
 *
 * The raw Next router is always available as `.router`, so this is strictly a
 * superset — you never lose access to native navigation.
 *
 * Every method is referentially stable for a given `(router, pathname)` pair,
 * so it is safe as an effect dependency and does not defeat `React.memo`.
 *
 * @example
 * const nav = useSmartRouter();
 * nav.push("../settings", { scroll: false });
 * nav.push("/checkout", { state: { cart } });
 * nav.fsBack();
 */
export function useSmartRouter(): SmartRouter {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  // Guards may run asynchronously; keep the latest path without re-binding.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const prepare = useCallback(
    (target: string, options: NavigateOptions | undefined): string => {
      const current = readCurrentHref(pathnameRef.current);
      let href = resolvePath(current, target);

      const config = getConfig();
      const keep = options?.keepQuery ?? true;

      if (keep !== false) {
        const keys = [...config.stickyQuery, ...(Array.isArray(keep) ? keep : [])];
        if (keys.length) {
          href = carryQuery(href, selectQuery(current, keys));
        }
      }

      if (options?.query) href = withQuery(href, options.query);
      if (options?.flash) writeFlash(options.flash);
      if (options?.state !== undefined) {
        href = writeTransfer(href, options.state, { strategy: options.strategy });
      }

      return href;
    },
    []
  );

  const navigate = useCallback(
    (type: NavigationType, target: string, options?: NavigateOptions) => {
      const from = readCurrentHref(pathnameRef.current);
      const to = prepare(target, options);

      void runGuards({ from, to, type }).then((allowed) => {
        if (!allowed) return;

        if (options?.shallow) {
          applyShallowUrl(to, type === "push" ? "push" : "replace");
        } else if (type === "replace") {
          router.replace(to, { scroll: options?.scroll });
        } else {
          router.push(to, { scroll: options?.scroll });
        }

        emitNavigation({ type, from, to, shallow: options?.shallow ?? false });
      });
    },
    [prepare, router]
  );

  const push = useCallback(
    (target: string, options?: NavigateOptions) => navigate("push", target, options),
    [navigate]
  );

  const replace = useCallback(
    (target: string, options?: NavigateOptions) => navigate("replace", target, options),
    [navigate]
  );

  const back = useCallback(() => {
    const from = readCurrentHref(pathnameRef.current);
    void runGuards({ from, to: "", type: "back" }).then((allowed) => {
      if (!allowed) return;
      router.back();
      emitNavigation({ type: "back", from, to: "", shallow: false, route: null });
    });
  }, [router]);

  const forward = useCallback(() => {
    router.forward();
  }, [router]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const prefetch = useCallback(
    (target: string, options?: PrefetchOptions) => {
      const href = resolvePath(readCurrentHref(pathnameRef.current), target);
      // `kind` is not in Next's public types on every minor; pass through loosely.
      (router.prefetch as (url: string, opts?: unknown) => void)(href, options);
    },
    [router]
  );

  const up = useCallback(
    (levels = 1, options?: NavigateOptions) => {
      const href = fsBackPathSafe(pathnameRef.current, { levels });
      navigate("fsBack", href, options);
    },
    [navigate]
  );

  const fsBack = useCallback((options?: NavigateOptions) => up(1, options), [up]);

  const sibling = useCallback(
    (name: string, options?: NavigateOptions) => push(`../${name}`, options),
    [push]
  );

  const child = useCallback(
    (name: string, options?: NavigateOptions) => push(`./${name}`, options),
    [push]
  );

  const root = useCallback((options?: NavigateOptions) => push("/", options), [push]);

  const resolve = useCallback(
    (target: string) => resolvePath(readCurrentHref(pathnameRef.current), target),
    []
  );

  const canNavigate = useCallback(
    (target: string) => routeExists(resolvePath(pathnameRef.current, target)),
    []
  );

  const pushIfExists = useCallback(
    (target: string, options?: NavigateOptions & { fallback?: string }): boolean => {
      if (canNavigate(target)) {
        push(target, options);
        return true;
      }
      if (options?.fallback) push(options.fallback, options);
      return false;
    },
    [canNavigate, push]
  );

  const setQuery = useCallback(
    (patch: QueryInput, options?: NavigateOptions) => {
      const current = readCurrentHref(pathnameRef.current);
      const href = withQuery(current, patch);
      navigate("query", href, { shallow: true, ...options, keepQuery: false });
    },
    [navigate]
  );

  return useMemo(
    () => ({
      pathname,
      router,
      push,
      replace,
      back,
      forward,
      refresh,
      prefetch,
      fsBack,
      pop: fsBack,
      up,
      sibling,
      child,
      root,
      canNavigate,
      pushIfExists,
      resolve,
      setQuery,
    }),
    [
      pathname,
      router,
      push,
      replace,
      back,
      forward,
      refresh,
      prefetch,
      fsBack,
      up,
      sibling,
      child,
      root,
      canNavigate,
      pushIfExists,
      resolve,
      setQuery,
    ]
  );
}
