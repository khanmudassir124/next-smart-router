"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type Ref,
} from "react";

import { getConfig } from "../core/config";
import { emitNavigation, hasGuards, runGuards } from "../core/events";
import { isActive as isActiveCore, type IsActiveOptions } from "../core/is-active";
import { resolvePath } from "../core/resolve-path";
import { writeFlash, writeTransfer, type FlashMessage } from "../core/transfer";
import type { TransferStrategy } from "../core/config";
import { carryQuery, selectQuery, withQuery, type QueryInput } from "../core/url";

/** When a link starts prefetching. */
export type PrefetchStrategy = "render" | "hover" | "viewport" | false;

export interface SmartLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> {
  /** Absolute ("/w/42"), relative ("../members"), or query-only ("?tab=all"). */
  href: string;
  /** Applied when the link is active. */
  activeClassName?: string;
  /** Only the exact path counts as active. */
  exact?: boolean;
  /** Compare these query keys when deciding active state. */
  matchQuery?: readonly string[];
  /** Replace the current history entry instead of pushing. */
  replace?: boolean;
  /** Skip scrolling to the top after navigation. */
  scroll?: boolean;
  /** When prefetching happens. Default "hover". */
  prefetch?: PrefetchStrategy;
  /** Query params merged into the resolved href. */
  query?: QueryInput;
  /** Carry sticky query params. `true` (default), `false`, or extra keys. */
  keepQuery?: boolean | readonly string[];
  /** Data handed to the destination. Read there with `useRouteState`. */
  state?: unknown;
  /** Backing store for `state`. */
  strategy?: TransferStrategy;
  /** One-shot message for the destination. */
  flash?: FlashMessage;
  ref?: Ref<HTMLAnchorElement>;
}

/** Milliseconds of hover before prefetching — long enough to skip a passing cursor. */
const HOVER_INTENT_MS = 80;

/**
 * `next/link` that understands filesystem-style relative hrefs, carries sticky
 * query params, and knows whether it is active.
 *
 * Relative navigation only worked through `useSmartRouter().push()` before
 * this, which meant every `<Link>` in an app stayed absolute — the feature was
 * missing from exactly the place most navigation lives.
 *
 * @example
 * <SmartLink href="../members" activeClassName="is-active">Members</SmartLink>
 */
export const SmartLink = forwardRef<HTMLAnchorElement, SmartLinkProps>(
  function SmartLink(props, ref) {
    const {
      href,
      activeClassName,
      exact,
      matchQuery,
      replace,
      scroll,
      prefetch = "hover",
      query,
      keepQuery = true,
      state,
      strategy,
      flash,
      className,
      onClick,
      onMouseEnter,
      children,
      ...rest
    } = props;

    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const anchorRef = useRef<HTMLAnchorElement | null>(null);
    const prefetched = useRef(false);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resolved = useMemo(() => {
      const current =
        typeof window === "undefined" ? pathname : pathname + window.location.search;

      let next = resolvePath(current, href);

      const config = getConfig();
      if (keepQuery !== false) {
        const keys = [
          ...config.stickyQuery,
          ...(Array.isArray(keepQuery) ? keepQuery : []),
        ];
        if (keys.length) {
          next = carryQuery(next, selectQuery(current, keys));
        }
      }

      return query ? withQuery(next, query) : next;
    }, [href, pathname, keepQuery, query]);

    const active = useMemo(() => {
      const options: IsActiveOptions = { exact };
      if (matchQuery) options.matchQuery = matchQuery;
      return isActiveCore(pathname, resolved, options);
    }, [pathname, resolved, exact, matchQuery]);

    /* --- prefetch strategies --- */

    const doPrefetch = useCallback(() => {
      if (prefetched.current || prefetch === false) return;
      prefetched.current = true;
      router.prefetch(resolved);
    }, [prefetch, router, resolved]);

    useEffect(() => {
      if (prefetch !== "viewport" || typeof IntersectionObserver === "undefined") {
        return;
      }
      const node = anchorRef.current;
      if (!node) return;

      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            doPrefetch();
            observer.disconnect();
          }
        }
      });

      observer.observe(node);
      return () => observer.disconnect();
    }, [prefetch, doPrefetch]);

    useEffect(
      () => () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
      },
      []
    );

    const handleMouseEnter = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        if (prefetch !== "hover") return;

        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(doPrefetch, HOVER_INTENT_MS);
      },
      [onMouseEnter, prefetch, doPrefetch]
    );

    /* --- click: guards, transfer, flash --- */

    const handleClick = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;

        // Let the browser handle modified clicks and new-tab targets.
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }

        if (flash) writeFlash(flash);
        if (state !== undefined) writeTransfer(resolved, state, { strategy });

        const from =
          typeof window === "undefined" ? pathname : pathname + window.location.search;
        const type = replace ? "replace" : "push";

        // Fast path: with no guards registered, let next/link navigate.
        // Taking the navigation over would cost its prefetch cache and
        // scroll handling for no benefit.
        if (!hasGuards()) {
          emitNavigation({ type, from, to: resolved, shallow: false });
          return;
        }

        // A guard needs the chance to cancel, so the navigation moves to us.
        event.preventDefault();

        void runGuards({ from, to: resolved, type }).then((allowed) => {
          if (!allowed) return;

          if (replace) router.replace(resolved, { scroll });
          else router.push(resolved, { scroll });

          emitNavigation({ type, from, to: resolved, shallow: false });
        });
      },
      [onClick, flash, state, strategy, resolved, pathname, replace, router, scroll]
    );

    const composedClassName =
      [className, active && activeClassName].filter(Boolean).join(" ") || undefined;

    return (
      <Link
        {...rest}
        href={resolved}
        replace={replace}
        scroll={scroll}
        prefetch={prefetch === "render"}
        className={composedClassName}
        aria-current={active ? "page" : undefined}
        data-active={active ? "true" : undefined}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        ref={(node: HTMLAnchorElement | null) => {
          anchorRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as { current: HTMLAnchorElement | null }).current = node;
        }}
      >
        {children}
      </Link>
    );
  }
);
