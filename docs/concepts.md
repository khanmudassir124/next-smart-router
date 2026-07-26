# Concepts

## The filesystem mental model

next-smart-router treats your route tree like a Unix filesystem. A pathname is
a "working directory", and you can move around it with relative paths:

| Call | From `/workspaces/42` | Result |
| --- | --- | --- |
| `push("./docs")` | append | `/workspaces/42/docs` |
| `push("../")` | up one | `/workspaces` |
| `push("../99")` | sibling | `/workspaces/99` |
| `push("/settings")` | absolute | `/settings` |

This resolution is pure string math — see [`resolvePath`](./api-reference.md#resolvepathcurrent-target).
It does **not** consult the registry, so it works even for routes you haven't
registered.

## The route registry

Everything that needs to know "is this a real route?" reads from a single
in-memory registry — a `Set<string>` of **route patterns** (with dynamic
segments intact, e.g. `/workspaces/[id]`).

```
generate CLI  ──►  route-manifest.ts  ──►  initializeSmartRouter({ routes })
                                                      │
                                                      ▼
                                              route registry (Set)
                                                      │
              ┌───────────────┬───────────────┬───────┴────────┐
              ▼               ▼               ▼                ▼
         getParams     getBreadcrumbs   fsBackPathSafe   getNearestStaticRoute
```

The registry always contains `/`. It is read **lazily** at call time, so any
route you register (even late, or in a test with `force: true`) is immediately
visible to every helper.

You can also drive it directly without the CLI:

```ts
import { setRoutes, getRoutes, hasRoutes } from "next-smart-router";

setRoutes(["/", "/about", "/blog/[slug]"]);
hasRoutes(); // true
```

## Segment types & matching

A concrete path is matched against a pattern segment-by-segment:

| Pattern segment | Meaning | Matches |
| --- | --- | --- |
| `about` | static | exactly `about` |
| `[id]` | dynamic | exactly one segment |
| `[...slug]` | catch-all | **one or more** segments (must be last) |
| `[[...slug]]` | optional catch-all | **zero or more** segments (must be last) |

Examples ([`matchRoutePattern`](./api-reference.md#matchroute--matchroutepattern)):

```ts
matchRoutePattern("/workspaces/42", "/workspaces/[id]");   // true
matchRoutePattern("/docs/a/b/c",   "/docs/[...slug]");     // true
matchRoutePattern("/docs",         "/docs/[...slug]");     // false (needs ≥1)
matchRoutePattern("/files",        "/files/[[...path]]");  // true  (zero ok)
```

## Two kinds of "back"

- **`back()`** — the browser's history back (`router.back()`). Can leave your
  app if there's no in-app history.
- **`fsBack()` / `pop()`** — walks **up the current path** to the nearest
  ancestor that matches a registered route. It never lands on a 404 because `/`
  is always registered. Great for "up" buttons in nested detail views.

## Static vs. dynamic ancestors

`getNearestStaticRoute(pathname)` is a stricter cousin of `fsBackPathSafe`: it
returns the nearest ancestor that contains **no dynamic segments at all**. This
is useful when redirecting across domains, where a dynamic id from the current
domain wouldn't be valid on the target.

```ts
getNearestStaticRoute("/workspaces/42/settings"); // "/workspaces"
```

Next: [API Reference](./api-reference.md)
