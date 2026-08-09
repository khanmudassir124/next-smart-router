"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import {
  consumeFlash,
  readTransfer,
  clearTransferFor,
  subscribeTransfer,
  type FlashMessage,
} from "../core/transfer";
import { useClientLocationSearch } from "./use-location";

/**
 * Read the payload handed to this screen by `nav.push(href, { state })`.
 *
 * Returns `undefined` during the server render and on every cold entry —
 * a direct link, a refresh, a shared URL, a back navigation after a hard
 * reload. That is not a bug to work around; it is the contract. Treat the
 * value as a hydration hint for data you would fetch anyway:
 *
 * @example
 * const state = useRouteState<{ order: Order }>();
 *
 * const { data: order } = useQuery({
 *   queryKey: ["order", id],
 *   queryFn: () => fetchOrder(id),
 *   initialData: state?.order,   // skips the spinner, nothing more
 * });
 */
export function useRouteState<T>(): T | undefined {
  const pathname = usePathname() ?? "/";
  const search = useClientLocationSearch();
  const href = search ? `${pathname}?${search}` : pathname;

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return undefined;
    return readTransfer<T>(href);
  }, [href]);

  // An explicit server snapshot is what keeps the first client render
  // identical to the server's; reading storage during render would not.
  const getServerSnapshot = useCallback(() => undefined, []);

  return useSyncExternalStore(subscribeTransfer, getSnapshot, getServerSnapshot);
}

/**
 * `useRouteState` with a required fallback, for teams that would rather the
 * degraded path be a compile-time obligation than a code-review convention.
 */
export function useRouteStateOr<T>(fallback: () => T): T {
  const state = useRouteState<T>();
  const [computed] = useState<T | undefined>(() =>
    state === undefined ? undefined : state
  );
  return state ?? computed ?? fallback();
}

/** Drop the payload addressed to the current URL. */
export function useClearRouteState(): () => void {
  const pathname = usePathname() ?? "/";
  const search = useClientLocationSearch();
  const href = search ? `${pathname}?${search}` : pathname;

  return useCallback(() => clearTransferFor(href), [href]);
}

/**
 * Read the pending one-shot message, consuming it so it never fires twice.
 *
 * @example
 * const flash = useFlash();
 * useEffect(() => {
 *   if (flash) toast[flash.type](flash.message);
 * }, [flash]);
 */
export function useFlash(): FlashMessage | undefined {
  const [flash, setFlash] = useState<FlashMessage | undefined>(undefined);
  const consumed = useRef(false);
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    consumed.current = false;
  }, [pathname]);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const next = consumeFlash();
    if (next) setFlash(next);
  }, [pathname]);

  return flash;
}
