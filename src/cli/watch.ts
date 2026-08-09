import fs from "node:fs";
import path from "node:path";

import { generateRoutes, type GenerateRoutesOptions } from "./generate-routes";

const DEBOUNCE_MS = 100;

export interface WatchOptions extends GenerateRoutesOptions {
  /** Called after every regeneration. */
  onGenerate?: (routes: string[], changed: boolean) => void;
}

/**
 * Regenerate the manifest whenever a page file appears or disappears.
 *
 * Editors fire several events per save, so changes are debounced. Combined
 * with `generateRoutes`'s write-if-changed guard, a watcher pointed at a
 * directory Next is also watching cannot produce a rebuild loop.
 *
 * Returns a function that stops watching.
 */
export function watchRoutes(options: WatchOptions = {}): () => void {
  const appDir = options.appDir ?? path.join(process.cwd(), "app");

  const run = () => {
    try {
      const result = generateRoutes({ ...options, log: options.log ?? true });
      options.onGenerate?.(result.routes, result.changed);
    } catch (error) {
      console.error(
        `next-smart-router: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  run();

  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  };

  // Recursive watch is supported on Windows and macOS, and on Linux from
  // Node 20. The fallback polls the directory tree instead.
  let watcher: fs.FSWatcher | null = null;
  let poller: NodeJS.Timeout | null = null;

  try {
    watcher = fs.watch(appDir, { recursive: true }, (_event, filename) => {
      if (!filename) return schedule();
      const base = path.basename(filename.toString());
      if (
        base.startsWith("page.") ||
        base.startsWith("route.") ||
        !base.includes(".")
      ) {
        schedule();
      }
    });
  } catch {
    poller = setInterval(run, 2000);
  }

  // eslint-disable-next-line no-console
  console.log(
    `👀 next-smart-router: watching ${path.relative(process.cwd(), appDir) || "."}`
  );

  return () => {
    if (timer) clearTimeout(timer);
    if (poller) clearInterval(poller);
    watcher?.close();
  };
}
