/**
 * Runtime configuration shared by every helper in the package.
 *
 * Populated by {@link initializeSmartRouter}, or held per-instance by
 * `createRouter`. Kept dependency-free so any module can read it.
 */

export type StickyMatcher = string | RegExp;

/** Where a transfer payload is kept between two screens. */
export type TransferStrategy = "memory" | "session" | "url-key" | "query";

export interface TransferConfig {
  /** Default backing store. See the strategy table in the docs. */
  strategy: TransferStrategy;
  /** Payloads older than this are treated as absent. Default 5 minutes. */
  ttlMs: number;
  /** LRU cap on stored payloads. Default 20. */
  maxEntries: number;
  /** Per-payload byte ceiling. Default 256 KB. */
  maxBytes: number;
  /** What to do when a payload exceeds `maxBytes`. */
  onOverflow: "warn" | "throw" | "drop";
  /** Storage key prefix — avoids collisions between apps on one origin. */
  namespace: string;
}

export interface SmartRouterConfig {
  /** Next.js `basePath`, stripped before matching and re-applied on output. */
  basePath?: string;
  /** Next.js `trailingSlash`. */
  trailingSlash: boolean;
  /** Locale prefixes to strip before matching, e.g. `["en", "fr"]`. */
  locales?: readonly string[];
  /**
   * Query keys carried across every navigation performed through this package.
   * Screen-local params (page, sort) are dropped; session-scoped params
   * (locale, ref, utm_*) survive.
   */
  stickyQuery: readonly StickyMatcher[];
  /** Cross-screen transfer behaviour. */
  transfer: TransferConfig;
  /** Scroll behaviour after a library-driven navigation. */
  scrollRestoration: "auto" | "top" | "manual";
  /** CSS selector to move focus to after navigation, or `false`. */
  focusOnNavigate: string | false;
  /** Announce route changes to screen readers via an aria-live region. */
  announceNavigation: boolean;
  /** Allow the browser back button to be intercepted by navigation guards. */
  interceptBrowserBack: boolean;
}

export const DEFAULT_TRANSFER: TransferConfig = {
  strategy: "session",
  ttlMs: 5 * 60_000,
  maxEntries: 20,
  maxBytes: 256 * 1024,
  onOverflow: "warn",
  namespace: "nsr",
};

export const DEFAULT_CONFIG: SmartRouterConfig = {
  basePath: undefined,
  trailingSlash: false,
  locales: undefined,
  stickyQuery: [],
  transfer: DEFAULT_TRANSFER,
  scrollRestoration: "auto",
  focusOnNavigate: false,
  announceNavigation: false,
  interceptBrowserBack: false,
};

export type SmartRouterConfigInput = Partial<Omit<SmartRouterConfig, "transfer">> & {
  transfer?: Partial<TransferConfig>;
};

export function resolveConfig(
  input: SmartRouterConfigInput = {},
  base: SmartRouterConfig = DEFAULT_CONFIG
): SmartRouterConfig {
  return {
    ...base,
    ...input,
    transfer: { ...base.transfer, ...input.transfer },
  };
}

let config: SmartRouterConfig = DEFAULT_CONFIG;

/** The active global configuration. */
export function getConfig(): SmartRouterConfig {
  return config;
}

/** Merge `input` into the global configuration. */
export function setConfig(input: SmartRouterConfigInput): SmartRouterConfig {
  config = resolveConfig(input, config);
  return config;
}

/** Restore defaults. Intended for tests. */
export function resetConfig(): void {
  config = DEFAULT_CONFIG;
}
