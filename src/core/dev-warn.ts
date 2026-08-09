/**
 * Development-only diagnostics.
 *
 * Every warning here is behind a `process.env.NODE_ENV` check so bundlers can
 * drop the whole branch — and the message body with it — from production.
 */

import { hasRoutes } from "./route-registry";

const seen = new Set<string>();

export function isDev(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

/** Warn once per unique key. */
export function warnOnce(key: string, message: string): void {
  if (!isDev() || seen.has(key)) return;
  seen.add(key);

  console.warn(`next-smart-router: ${message}`);
}

/**
 * An uninitialized registry holds only "/", which makes every matcher return a
 * plausible-looking but wrong answer. Say so, once, rather than failing quietly.
 */
export function warnIfUninitialized(fnName: string): void {
  if (!isDev() || hasRoutes()) return;

  warnOnce(
    "uninitialized",
    `${fnName}() was called before initializeSmartRouter().\n` +
      `Only "/" is registered, so matching, breadcrumbs and fsBack will not behave as expected.\n\n` +
      `  1. npx next-smart-router generate --app-dir app --out route-manifest.ts\n` +
      `  2. import { ROUTES } from "./route-manifest";\n` +
      `     initializeSmartRouter({ routes: ROUTES });\n`
  );
}

/** Reset the warned-once ledger. Intended for tests. */
export function resetWarnings(): void {
  seen.clear();
}
