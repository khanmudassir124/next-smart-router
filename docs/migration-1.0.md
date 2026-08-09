# Migrating to 1.0

Most of 1.0 is additive. Three things changed shape, and several things that
looked like they worked in 0.1.x were quietly returning wrong answers — those
are fixed, which means some behaviour is intentionally different.

## Breaking changes

### `matchRoute` returns a match object, not a boolean

It now tells you _which_ route matched and with what params, which is what
makes `useRoute`, breadcrumb patterns, middleware protection and pattern-keyed
analytics possible.

```diff
- if (matchRoute("/w/42")) { … }
+ if (matchRoute("/w/42")) { … }          // still works — null is falsy

- const ok: boolean = matchRoute(path);
+ const ok: boolean = routeExists(path);  // if you need the boolean
+ const { route, params } = matchRoute(path) ?? {};
```

Truthiness is unchanged, so `if (matchRoute(x))` and `expect(matchRoute(x))`
guards keep working. Only code that compared to `true`/`false` needs updating.

### The route registry is derived, not raw

`setRoutes` now pre-computes specificity ordering and the static-route list.
Nothing changes for callers, but `getRoutes()` is no longer the object you
passed in — use `getOrderedRoutes()` when you need matching order.

### `smartHistory` is deprecated

A module-level instance holds one user's navigation stack, and on a Node server
every concurrent request shares it. It still works and still exports, but:

```diff
- import { smartHistory } from "next-smart-router";
- smartHistory.push("/step-2");

+ import { SmartHistoryProvider, useSmartHistory } from "next-smart-router/react";
+ // wrap the flow, then:
+ const history = useSmartHistory();
+ history.push("/step-2");
```

Or `createSmartHistory()` for a plain instance you own.

## Behaviour that is now correct

Each of these was reproducible in 0.1.1. If you worked around one, remove the
workaround.

| Was                                                                                                                            | Now                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `getParams({ pathname: "/docs/about" })` returned `{ slug: ["about"] }` because a catch-all sorted ahead of its static sibling | Static wins, per Next.js specificity               |
| An empty optional catch-all captured `[]`                                                                                      | Captures `undefined`, matching Next                |
| Catch-all segments were not URI-decoded                                                                                        | Decoded, like single dynamic segments already were |
| A malformed escape (`/w/%E0%A4%A`) threw `URIError` and crashed the render                                                     | Degrades to the raw value                          |
| `resolvePath("/a/b?q=1", "./x")` → `"/a/b?q=1/x"`                                                                              | `"/a/b/x"`; query- and hash-only targets work too  |
| `matchRoute("/workspaces?tab=1")` → `false`                                                                                    | Query and hash are ignored when matching           |
| Breadcrumb labels were raw slugs (`hello%20world`)                                                                             | Decoded, with `format`, `labels` and `labelFor`    |
| `resetSmartRouter()` left routes registered                                                                                    | Resets routes and config                           |

## CLI output changes

The manifest is more accurate, so regenerating may add or remove routes:

- A page in a folder named `api` (e.g. `/settings/api`) is **no longer dropped**.
  Route handlers are now detected by `route.ts`, not by folder name.
- Intercepting routes (`(.)photo`, `(..)feed`) are **no longer emitted** as
  literal segments like `/feed/(..)photo`.
- `page.mdx` is found by default; `--page-extensions` mirrors `next.config`.
- Routes are emitted in specificity order rather than lexical order.
- The file is only written when its content changes.

New by default: a `Route` union type and a `META` map from `route.meta.json`
sidecars. Pass `--no-types` / `--no-meta` to opt out.

## Recommended follow-ups

None of these are required, but they are why you'd upgrade:

1. **Register the route union** (`Register` module augmentation) — turns every
   route argument into a checked literal and infers params from patterns.
2. **Adopt the plugin** (`withSmartRouter`) — removes the stale-manifest failure
   mode entirely.
3. **Replace hand-rolled query state** with `useQueryState` / `useQueryStates`.
4. **Declare `stickyQuery`** if you were threading `locale` or `utm_*` through
   navigations by hand.
5. **Add `<SmartRouterDevtools />`** in development.
