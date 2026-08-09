"use client";

import { useEffect } from "react";

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

  useEffect(() => {
    if (!when) return;

    const guard: NavigationGuard = async ({ cancel }) => {
      const allowed = confirm
        ? await confirm(message)
        : typeof window !== "undefined"
          ? window.confirm(message)
          : true;

      if (!allowed) cancel();
    };

    const release = onBeforeNavigate(guard);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers require a return value to trigger the prompt.
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    let releaseBack: (() => void) | undefined;
    if (getConfig().interceptBrowserBack) {
      releaseBack = installBackSentinel(message, confirm);
    }

    return () => {
      release();
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseBack?.();
    };
  }, [when, message, confirm]);
}

/**
 * Catch the browser back button by pushing a duplicate history entry and
 * re-pushing it whenever the user pops off it.
 *
 * Opt-in because it makes the history stack one entry deeper than the user
 * expects, which is visible if they hold the back button.
 */
function installBackSentinel(
  message: string,
  confirm?: (message: string) => boolean | Promise<boolean>
): () => void {
  if (typeof window === "undefined") return () => {};

  window.history.pushState(window.history.state, "", window.location.href);

  const onPopState = async () => {
    const allowed = confirm ? await confirm(message) : window.confirm(message);

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
