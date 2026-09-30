import { createRequire } from "node:module";
import path from "node:path";

import type { RouteConflict } from "../core/create-router";
import { findUnreachableRoutes, type UnreachableRoute } from "../core/unreachable";

/**
 * Extra diagnostics for `generate --check`, kept out of `src/core` on purpose.
 *
 * The Next.js probe below reaches into a framework internal. That is tolerable
 * in a dev-time CLI with a visible fallback; it is not tolerable in core, which
 * has to stay edge-safe and free of a `next` import.
 */

const NEXT_SORTER = "next/dist/shared/lib/router/utils/sorted-routes";

export type NextCheck =
  | { status: "ok" }
  /** Next itself refuses this route set, so `next build` will fail. */
  | { status: "rejected"; message: string }
  /** The probe could not run. Never an error — just less signal. */
  | { status: "unavailable"; reason: string };

type SortRoutes = (routes: string[]) => string[];

/**
 * Load Next's own route sorter from the consuming project.
 *
 * Resolved against the user's cwd, not ours: `next` is a peer dependency, so
 * the copy that matters is the one their app builds with. Deliberately avoids
 * `import.meta`, which tsup rewrites to `{}` in the CJS output.
 */
function loadNextSorter(): SortRoutes {
  const requireFrom = createRequire(path.join(process.cwd(), "package.json"));
  const mod = requireFrom(NEXT_SORTER) as { getSortedRoutes: SortRoutes };
  return mod.getSortedRoutes;
}

/**
 * Ask Next whether it would accept this route set.
 *
 * `getSortedRoutes` is what Next uses at build time, so a throw here means the
 * user's `next build` fails — worth surfacing from the CLI, seconds instead of
 * minutes. It catches a whole class `validateRoutes` cannot see, because that
 * only compares dynamic segment names among siblings under one parent while
 * Next checks every position across the tree.
 */
export function checkWithNext(
  routes: readonly string[],
  load: () => SortRoutes = loadNextSorter
): NextCheck {
  let sortRoutes: SortRoutes;
  try {
    sortRoutes = load();
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    sortRoutes([...routes]);
    return { status: "ok" };
  } catch (error) {
    return {
      status: "rejected",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** One line per unreachable route, plus the caveat that makes it honest. */
export function formatUnreachable(unreachable: readonly UnreachableRoute[]): string[] {
  if (unreachable.length === 0) return [];

  const lines = [
    `⚠ ${unreachable.length} route${unreachable.length === 1 ? "" : "s"} unreachable ` +
      `by any URL that this manifest models:`,
  ];

  for (const { route, witnesses } of unreachable) {
    // Any witness proves the point; show the shortest, it reads best.
    const proof = witnesses.find((w) => w.wonBy) ?? witnesses[0];
    lines.push(
      proof?.wonBy
        ? `    ${route} — "${proof.url}" resolves to ${proof.wonBy}`
        : `    ${route} — no URL reaches it`
    );
  }

  lines.push(
    "  Rewrites in next.config and middleware are NOT modeled, so a route",
    "  reached only through a rewrite will appear here. Check before deleting."
  );

  return lines;
}

/** The message for a route set Next itself rejects. */
export function formatNextCheck(check: NextCheck): string[] {
  if (check.status === "ok") return [];
  if (check.status === "rejected") {
    return [
      `✗ Next rejects this route set, so "next build" will fail:`,
      `    ${check.message}`,
    ];
  }
  return [`  (skipped Next's own route validation — ${NEXT_SORTER} not loadable here)`];
}

/**
 * Produce every extra `--check` line for a route set.
 *
 * Pure enough to test without a filesystem or a spawned binary: pass `load` to
 * control the Next probe.
 */
export function diagnose(
  routes: readonly string[],
  load?: () => SortRoutes
): { lines: string[]; unreachable: UnreachableRoute[]; next: NextCheck } {
  const unreachable = findUnreachableRoutes(routes);
  const next = checkWithNext(routes, load);

  return {
    lines: [...formatUnreachable(unreachable), ...formatNextCheck(next)],
    unreachable,
    next,
  };
}

/**
 * The `--check` exit code, as a function of what was found.
 *
 * Extracted so it can be asserted without spawning the binary: the CLI's
 * spawn tests self-skip when `dist/` is absent, which is every job in the CI
 * matrix except the one that builds first.
 *
 * Unreachable routes and a Next rejection are WARNINGS. They do not fail the
 * build, because neither has been validated against apps that use rewrites.
 * Only a manifest conflict at error level, or a stale manifest, exits 1 —
 * unchanged from before this check existed.
 */
export function checkExitCode(input: {
  conflicts: readonly RouteConflict[];
  changed: boolean;
}): 0 | 1 {
  const hasError = input.conflicts.some((conflict) => conflict.level === "error");
  return hasError || input.changed ? 1 : 0;
}
