/**
 * Next.js plugin.
 *
 * Wrapping the config removes the two things that make a generated manifest
 * go stale: remembering to run the generator, and keeping `basePath` /
 * `pageExtensions` in sync between `next.config` and the CLI flags.
 */

import fs from "node:fs";
import path from "node:path";

import { generateRoutes, type GenerateRoutesOptions } from "./cli/generate-routes";
import { watchRoutes } from "./cli/watch";

export interface SmartRouterPluginOptions extends Omit<
  GenerateRoutesOptions,
  "pageExtensions"
> {
  /** Override the detected app directory. */
  appDir?: string;
  /** Watch during `next dev`. Default `true`. */
  watch?: boolean;
}

/** The subset of `next.config` this plugin reads. */
interface NextConfigLike {
  basePath?: string;
  trailingSlash?: boolean;
  pageExtensions?: string[];
  [key: string]: unknown;
}

let started = false;

function detectAppDir(explicit?: string): string {
  if (explicit) return path.resolve(explicit);

  const cwd = process.cwd();
  const candidates = [path.join(cwd, "app"), path.join(cwd, "src", "app")];

  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
}

/**
 * Generate the route manifest on `next dev` (watching) and on `next build`.
 *
 * @example
 * // next.config.ts
 * import { withSmartRouter } from "next-smart-router/plugin";
 *
 * export default withSmartRouter({
 *   basePath: "/app",
 * }, {
 *   out: "src/route-manifest.ts",
 * });
 */
export function withSmartRouter<T extends NextConfigLike>(
  nextConfig: T = {} as T,
  options: SmartRouterPluginOptions = {}
): T {
  // `next.config` is evaluated more than once per process; generate once.
  if (!started) {
    started = true;

    const appDir = detectAppDir(options.appDir);
    const generateOptions: GenerateRoutesOptions = {
      ...options,
      appDir,
      pageExtensions: nextConfig.pageExtensions,
    };

    try {
      if (options.watch !== false && process.env.NODE_ENV === "development") {
        watchRoutes(generateOptions);
      } else {
        generateRoutes(generateOptions);
      }
    } catch (error) {
      // A missing app dir must not take down the whole Next config.

      console.warn(
        `next-smart-router: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return nextConfig;
}

export default withSmartRouter;
