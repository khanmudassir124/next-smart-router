import { usePathname, useRouter } from "next/navigation";
import { resolvePath } from "../core/resolve-path";
import { fsBackPathSafe } from "../core/fs-back";

/** The App Router instance returned by `next/navigation`'s `useRouter`. */
export type NextAppRouter = ReturnType<typeof useRouter>;

export interface SmartRouter {
  /** The current pathname (from `next/navigation`). */
  pathname: string;
  /**
   * The underlying `next/navigation` router, untouched. Use this for anything
   * next-smart-router doesn't wrap — `prefetch`, `refresh`, `forward`, or
   * plain absolute `push`/`replace` with `scroll`/other options.
   */
  router: NextAppRouter;
  /** Navigate to `target`, resolved relative to the current path. */
  push: (target: string) => void;
  /** Replace with `target`, resolved relative to the current path. */
  replace: (target: string) => void;
  /** Browser history back. */
  back: () => void;
  /** Browser history forward (delegates to the native router). */
  forward: () => void;
  /** Refresh the current route (delegates to the native router). */
  refresh: () => void;
  /** Prefetch a route, resolved relative to the current path. */
  prefetch: (target: string) => void;
  /** Navigate to the nearest existing ancestor route (never a 404). */
  fsBack: () => void;
  /** Alias of {@link fsBack}. */
  pop: () => void;
}

/**
 * A drop-in wrapper around `next/navigation`'s router that understands
 * relative, filesystem-style paths (`./x`, `../x`) and can safely walk up to
 * the nearest existing route.
 *
 * The raw Next router is always available as `.router`, so this is strictly a
 * superset — you never lose access to native navigation.
 *
 * @example
 * const nav = useSmartRouter();
 * nav.push("../settings");     // relative, resolved against the current path
 * nav.fsBack();                // up to the nearest real route
 * nav.router.refresh();        // native Next router escape hatch
 */
export function useSmartRouter(): SmartRouter {
  const router = useRouter();
  const pathname = usePathname();

  const push = (target: string) => {
    router.push(resolvePath(pathname, target));
  };

  const replace = (target: string) => {
    router.replace(resolvePath(pathname, target));
  };

  const back = () => {
    router.back();
  };

  const forward = () => {
    router.forward();
  };

  const refresh = () => {
    router.refresh();
  };

  const prefetch = (target: string) => {
    router.prefetch(resolvePath(pathname, target));
  };

  const fsBack = () => {
    router.push(fsBackPathSafe(pathname));
  };

  const pop = () => {
    fsBack();
  };

  return {
    pathname,
    router,
    push,
    replace,
    back,
    forward,
    refresh,
    prefetch,
    fsBack,
    pop,
  };
}
