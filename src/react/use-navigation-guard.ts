"use client";

import { useEffect, useRef } from "react";

import { getConfig } from "../core/config";
import { onBeforeNavigate, type NavigationGuard } from "../core/events";

export interface NavigationGuardOptions {
  /** Block navigation while this is true. */
  when: boolean;
  /** Confirmation text. Ignored by `beforeunload`, which is browser-styled. */
  message?: string;
  /**
   * Custom confirmation. Return `true` to allow the navigation.
   * Defaults to `window.confirm(message)`.
   */
  confirm?: (message: string) => boolean | Promise<boolean>;
}

const DEFAULT_MESSAGE = "You have unsaved changes. Leave anyway?";

/**
 * Block navigation while a form is dirty.
 *
 * Coverage, stated plainly rather than implied:
 *
 *  - `nav.push` / `replace` / `fsBack` and `<SmartLink>` clicks are fully
 *    intercepted, with your own confirmation UI if you supply one.
 *  - Hard navigations, tab close and reload are covered by `beforeunload`,
 *    which shows the browser's own prompt and ignores `message`.
 *  - The browser *back* button needs a `history.pushState` sentinel, which has
 *    real edge cases; enable it with `interceptBrowserBack: true` in
 *    `initializeSmartRouter`.
 *
 * @example
 * useNavigationGuard({ when: form.formState.isDirty });
 */
export function useNavigationGuard(options: NavigationGuardOptions): void {
  const { when, message = DEFAULT_MESSAGE, confirm } = options;

  // Read at navigation time, not captured by the effect. An inline `confirm`
  // arrow is a new function every render; as an effect dependency it
  // re-installed everything per render, and with interceptBrowserBack each
  // install pushed another history entry the user then had to back through.
  const latest = useRef({ message, confirm });
  latest.current = { message, confirm };

  useEffect(() => {
    if (!when) return;

    const ask = (): boolean | Promise<boolean> => {
      const { message, confirm } = latest.current;
      if (confirm) return confirm(message);
      return typeof window !== "undefined" ? window.confirm(message) : true;
    };

    const guard: NavigationGuard = async ({ cancel }) => {
      if (!(await ask())) cancel();
    };

    const release = onBeforeNavigate(guard);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers require a return value to trigger the prompt.
      event.returnValue = latest.current.message;
      return latest.current.message;
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    let releaseBack: (() => void) | undefined;
    if (getConfig().interceptBrowserBack) {
      releaseBack = installBackSentinel(ask);
    }

    return () => {
      release();
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseBack?.();
    };
  }, [when]);
}

/**
 * Catch the browser back button by pushing a duplicate history entry and
 * re-pushing it whenever the user pops off it.
 *
 * Opt-in because it makes the history stack one entry deeper than the user
 * expects, which is visible if they hold the back button.
 */
function installBackSentinel(ask: () => boolean | Promise<boolean>): () => void {
  if (typeof window === "undefined") return () => {};

  window.history.pushState(window.history.state, "", window.location.href);

  const onPopState = async () => {
    const allowed = await ask();

    if (allowed) {
      window.removeEventListener("popstate", onPopState);
      window.history.back();
    } else {
      window.history.pushState(window.history.state, "", window.location.href);
    }
  };

  window.addEventListener("popstate", onPopState);
  return () => window.removeEventListener("popstate", onPopState);
}
