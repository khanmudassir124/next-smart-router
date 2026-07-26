import { matchRoute } from "./route-matcher";
import { getRoutes } from "./route-registry";
import { toSegments } from "./segments";

export interface Breadcrumb {
  label: string;
  href: string;
}

/**
 * Build a breadcrumb trail for `pathname`, including only ancestor paths that
 * correspond to a known (matchable) route.
 *
 *   getBreadcrumbs("/workspaces/42/settings")
 *   -> [{ label: "workspaces", href: "/workspaces" },
 *       { label: "42",         href: "/workspaces/42" },
 *       { label: "settings",   href: "/workspaces/42/settings" }]
 */
export function getBreadcrumbs(pathname: string): Breadcrumb[] {
  const routes = getRoutes();
  const parts = toSegments(pathname);
  const crumbs: Breadcrumb[] = [];

  for (let i = 0; i < parts.length; i++) {
    const href = "/" + parts.slice(0, i + 1).join("/");

    if (matchRoute(href, routes)) {
      crumbs.push({ label: parts[i], href });
    }
  }

  return crumbs;
}
