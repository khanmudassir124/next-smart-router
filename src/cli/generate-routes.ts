import fs from "node:fs";
import path from "node:path";

import { compareSpecificity } from "../core/segments";
import { validateRoutes, type RouteConflict } from "../core/create-router";
import type { RouteMeta, RouteMetaMap } from "../core/route-state";

const DEFAULT_PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js", "mdx", "md"];
const ROUTE_FILES = ["route.ts", "route.js", "route.tsx", "route.jsx"];

/**
 * Intercepting-route folders: `(.)photo`, `(..)feed`, `(..)(..)x`, `(...)root`.
 * They render an existing URL in place and contribute no route of their own.
 */
const INTERCEPTING = /^\((\.|\.\.|\.\.\.)\)/;

export interface GenerateRoutesOptions {
  /** Root of the Next.js `app` directory. Default: `<cwd>/app`. */
  appDir?: string;
  /** Output file path. Extension decides the format (`.ts`/`.js` or `.json`). */
  out?: string;
  /** Log the result to stdout. Default: `true`. */
  log?: boolean;
  /** Mirrors `pageExtensions` from `next.config`. */
  pageExtensions?: string[];
  /** Emit a `Route` union type alongside `ROUTES`. Default: `true`. */
  emitTypes?: boolean;
  /** Collect `route.meta.*` sidecars into a `META` map. Default: `true`. */
  emitMeta?: boolean;
  /** Extra directory names to skip, beyond the built-in conventions. */
  ignore?: string[];
}

export interface GenerateResult {
  routes: string[];
  meta: RouteMetaMap;
  conflicts: RouteConflict[];
  /** False when the output file already held exactly this content. */
  changed: boolean;
  out: string;
}

function pageFilesFor(extensions: string[]): string[] {
  return extensions.map((ext) => `page.${ext.replace(/^\./, "")}`);
}

function hasPage(dir: string, pageFiles: string[]): boolean {
  return pageFiles.some((file) => fs.existsSync(path.join(dir, file)));
}

function isRouteHandler(dir: string): boolean {
  return ROUTE_FILES.some((file) => fs.existsSync(path.join(dir, file)));
}

function readMeta(dir: string): RouteMeta | undefined {
  // Only JSON is read statically — evaluating a TS/JS module would require a
  // loader, and the plugin path (which has one) can supply richer metadata.
  const jsonPath = path.join(dir, "route.meta.json");
  if (!fs.existsSync(jsonPath)) return undefined;

  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as RouteMeta;
  } catch {
    return undefined;
  }
}

interface WalkContext {
  pageFiles: string[];
  ignore: Set<string>;
  emitMeta: boolean;
  meta: RouteMetaMap;
}

/** A route, and the folder that produced it. */
interface FoundRoute {
  route: string;
  dir: string;
}

function walk(dir: string, base: string, ctx: WalkContext): FoundRoute[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const routes: FoundRoute[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const name = entry.name;

    // Private folders, parallel-route slots, and anything explicitly ignored.
    if (name.startsWith("_") || name.startsWith("@") || ctx.ignore.has(name)) {
      continue;
    }

    // Intercepting routes render an existing URL; they add no new route.
    if (INTERCEPTING.test(name)) continue;

    const full = path.join(dir, name);

    // Route groups `(marketing)` contribute no path segment.
    const isGroup = name.startsWith("(") && name.endsWith(")");
    const segment = isGroup ? "" : name;
    const route = segment ? `${base}/${segment}` : base;

    // A page wins over a route handler at the same path; a folder holding only
    // `route.ts` is an API endpoint, not a page.
    if (hasPage(full, ctx.pageFiles) && !isRouteHandler(full)) {
      const routePath = route || "/";
      routes.push({ route: routePath, dir: full });

      if (ctx.emitMeta) {
        const meta = readMeta(full);
        if (meta) ctx.meta[routePath] = meta;
      }
    }

    routes.push(...walk(full, route, ctx));
  }

  return routes;
}

/**
 * Walk the Next.js `app` directory and return the sorted list of route
 * patterns (dynamic segments preserved, e.g. `/docs/[...slug]`).
 *
 * Conventions honoured: route groups `(name)`, private folders `_name`,
 * parallel slots `@name`, intercepting routes `(.)name`, and route handlers
 * (`route.ts`), which are excluded because they serve no page.
 */
export function collectRoutes(
  appDir: string,
  options: Pick<GenerateRoutesOptions, "pageExtensions" | "emitMeta" | "ignore"> = {}
): { routes: string[]; meta: RouteMetaMap; sources: Map<string, string[]> } {
  if (!fs.existsSync(appDir)) {
    throw new Error(`next-smart-router: app directory not found at "${appDir}"`);
  }

  const ctx: WalkContext = {
    pageFiles: pageFilesFor(options.pageExtensions ?? DEFAULT_PAGE_EXTENSIONS),
    ignore: new Set(options.ignore ?? []),
    emitMeta: options.emitMeta ?? true,
    meta: {},
  };

  const found = walk(appDir, "", ctx);

  // `walk` only ever inspects SUBdirectories, so a real `app/page.tsx` is
  // invisible to it — the root is injected below instead. Record it here so a
  // root collision (`app/page.tsx` beside `app/(shop)/page.tsx`) is still seen.
  if (hasPage(appDir, ctx.pageFiles) && !isRouteHandler(appDir)) {
    found.unshift({ route: "/", dir: appDir });
  }

  // Which folder(s) produced each route. Two folders reaching the same path is
  // a build failure in Next, and deduping first is what used to hide it.
  const sources = new Map<string, string[]>();
  for (const { route, dir } of found) {
    sources.set(route, [...(sources.get(route) ?? []), dir]);
  }

  const routes = [...new Set(["/", ...found.map((f) => f.route)])].sort(
    compareSpecificity
  );

  return { routes, meta: ctx.meta, sources };
}

/**
 * Folders that resolve to the same URL path.
 *
 * Route groups add no segment, so `(marketing)/about` and `(app)/about` both
 * serve `/about`. Next refuses to build that ("You cannot have two parallel
 * pages that resolve to the same path"), but the manifest used to collapse the
 * pair into one entry before anything could look, so `--check` never saw it.
 *
 *   app/(marketing)/about/page.tsx  ─┐
 *                                    ├─→  /about   ✗ two sources
 *   app/(app)/about/page.tsx        ─┘
 *
 * Reported under the existing `duplicate` kind rather than a new one: that
 * union is public, and widening it would break an exhaustive `switch` in any
 * consumer. The `level` separates the two cases.
 */
function duplicatePathConflicts(
  sources: Map<string, string[]>,
  appDir: string
): RouteConflict[] {
  const conflicts: RouteConflict[] = [];

  for (const [route, dirs] of sources) {
    if (dirs.length < 2) continue;

    const where = dirs
      .map((dir) => path.relative(appDir, dir) || ".")
      .sort()
      .join(", ");

    conflicts.push({
      level: "error",
      kind: "duplicate",
      message:
        `${dirs.length} folders resolve to "${route}" (${where}) — ` +
        `Next cannot build two pages at the same path`,
      routes: [route],
    });
  }

  return conflicts;
}

function serializeTs(
  routes: string[],
  meta: RouteMetaMap,
  options: GenerateRoutesOptions
): string {
  const lines = [
    "/* AUTO-GENERATED by next-smart-router — DO NOT EDIT */",
    "",
    `export const ROUTES = new Set(${JSON.stringify(routes, null, 2)});`,
  ];

  if (options.emitTypes ?? true) {
    lines.push(
      "",
      "/** Every route in this app. Register it to get typed params everywhere:",
      " *",
      ' *   declare module "next-smart-router" {',
      " *     interface Register { route: Route }",
      " *   }",
      " */",
      "export type Route =",
      ...routes.map((route) => `  | ${JSON.stringify(route)}`),
      "  ;"
    );
  }

  if ((options.emitMeta ?? true) && Object.keys(meta).length > 0) {
    lines.push("", `export const META = ${JSON.stringify(meta, null, 2)} as const;`);
  }

  return lines.join("\n") + "\n";
}

function serialize(
  routes: string[],
  meta: RouteMetaMap,
  out: string,
  options: GenerateRoutesOptions
): string {
  if (out.endsWith(".json")) {
    const payload = Object.keys(meta).length ? { routes, meta } : routes;
    return JSON.stringify(payload, null, 2) + "\n";
  }
  return serializeTs(routes, meta, options);
}

/**
 * Generate a route manifest from a Next.js `app` directory.
 *
 * The file is only written when its content changes, so this is safe to run on
 * every dev-server tick without triggering a rebuild loop.
 */
export function generateRoutes(options: GenerateRoutesOptions = {}): GenerateResult {
  const appDir = options.appDir ?? path.join(process.cwd(), "app");
  const out = options.out ?? path.join(process.cwd(), "route-manifest.ts");

  const { routes, meta, sources } = collectRoutes(appDir, options);
  const conflicts = [
    ...validateRoutes(routes),
    ...duplicatePathConflicts(sources, appDir),
  ];
  const next = serialize(routes, meta, out, options);

  const resolved = path.resolve(out);
  const previous = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : null;
  const changed = previous !== next;

  if (changed) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, next);
  }

  if (options.log ?? true) {
    const suffix = changed ? "" : " (unchanged)";
    // eslint-disable-next-line no-console
    console.log(
      `✅ next-smart-router: ${routes.length} routes → ${path.relative(process.cwd(), resolved)}${suffix}`
    );
    for (const conflict of conflicts) {
      const icon = conflict.level === "error" ? "✗" : "⚠";

      console.warn(`${icon} ${conflict.message}`);
    }
  }

  return { routes, meta, conflicts, changed, out: resolved };
}

export type { RouteConflict };
