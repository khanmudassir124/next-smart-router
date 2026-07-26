# API Reference

Import paths:

- `next-smart-router` — core (server-safe, no React/Next imports)
- `next-smart-router/react` — the client hook (`"use client"`)
- `next-smart-router/cli` — programmatic access to the route generator

---

## Initialization

### `initializeSmartRouter(options)`

Register the app's known routes. Call once.

```ts
function initializeSmartRouter(options: {
  routes: Iterable<string>;
  force?: boolean;
}): void;
```

- `routes` — route patterns (e.g. the `ROUTES` set from the manifest).
- `force` — re-initialize even if already initialized (tests/HMR). Default `false`.

Subsequent calls are ignored unless `force` is `true`.

### `resetSmartRouter()`

```ts
function resetSmartRouter(): void;
```

Clears the "initialized" flag (does not clear routes). Intended for tests.

### `isSmartRouterInitialized()`

```ts
function isSmartRouterInitialized(): boolean;
```

---

## Registry

### `setRoutes(routes)`

```ts
function setRoutes(routes: Iterable<string>): void;
```

Replace the registry. `/` is always kept.

### `getRoutes()`

```ts
function getRoutes(): Set<string>;
```

The current registry. Read lazily by all helpers.

### `hasRoutes()`

```ts
function hasRoutes(): boolean;
```

`true` if any route beyond the implicit `/` is registered.

---

## Params

### `getParams<Keys, Result>(options?)`

Extract dynamic route params for a pathname by matching it against the registry.

```ts
function getParams<
  Keys extends readonly string[] | undefined = undefined,
  Result extends Partial<Record<string, any>> = {}
>(options?: {
  coerce?: Record<string, (value: string | string[]) => any>;
  assert?: readonly string[];
  pathname?: string;
}): Keys extends readonly string[]
  ? { [K in Keys[number]]: K extends keyof Result ? Result[K] : string }
  : Record<string, string | string[] | undefined>;
```

- `pathname` — path to match. **Required on the server**; on the client it
  defaults to `window.location.pathname`.
- `coerce` — per-key transform applied to the matched raw value.
- `assert` — keys that must be present; throws if any is missing.

Type parameters:

- `Keys` — the param names, for a precisely-typed return object.
- `Result` — optional per-key value types (pairs with `coerce`).

```ts
// route: /workspaces/[id]/docs/[...path]
const { id, path } = getParams<["id", "path"]>();
// id: string, path: string[]

const { id } = getParams<["id"], { id: number }>({
  coerce: { id: (v) => Number(v) },
  assert: ["id"],
});
// id: number
```

Returns `{}` if no registered route matches.

**Types:** `ParamValue`, `ParamsFromKeys`, `Coercers`, `GetParamsOptions`.

---

## Navigation helpers

### `resolvePath(current, target)`

```ts
function resolvePath(current: string, target: string): string;
```

Resolve `target` against `current` like a filesystem path. Absolute targets
(`/x`) are returned unchanged; `.` and `..` are honored.

### `fsBackPathSafe(pathname)`

```ts
function fsBackPathSafe(pathname: string): string;
```

Nearest **existing** ancestor route of `pathname` (matched against the
registry). Falls back to `/`.

### `getNearestStaticRoute(pathname)`

```ts
function getNearestStaticRoute(pathname: string): string;
```

Nearest ancestor route with **no dynamic segments**. Falls back to `/`.

---

## Breadcrumbs

### `getBreadcrumbs(pathname)`

```ts
function getBreadcrumbs(pathname: string): { label: string; href: string }[];
```

Breadcrumb trail containing only ancestors that match a registered route.

```ts
getBreadcrumbs("/workspaces/42/settings");
// [{ label: "workspaces", href: "/workspaces" },
//  { label: "42",         href: "/workspaces/42" },
//  { label: "settings",   href: "/workspaces/42/settings" }]
```

**Type:** `Breadcrumb`.

---

## Matching

### `matchRoute` / `matchRoutePattern`

```ts
function matchRoutePattern(path: string, pattern: string): boolean;
function matchRoute(path: string, routes?: Set<string>): boolean;
```

`matchRoutePattern` tests one pattern; `matchRoute` tests against a set
(defaults to the registry). Both support dynamic, catch-all, and optional
catch-all segments.

### Segment utilities

```ts
function isDynamic(seg: string): boolean;          // "[id]"
function isCatchAll(seg: string): boolean;         // "[...slug]"
function isOptionalCatchAll(seg: string): boolean; // "[[...slug]]"
function getParamName(seg: string): string;        // "[...slug]" -> "slug"
function toSegments(path: string): string[];       // "/a/b" -> ["a","b"]
```

---

## React hook — `next-smart-router/react`

### `useSmartRouter()`

```ts
function useSmartRouter(): {
  pathname: string;
  router: NextAppRouter;              // the raw next/navigation router
  push: (target: string) => void;    // relative-aware
  replace: (target: string) => void; // relative-aware
  prefetch: (target: string) => void;// relative-aware
  back: () => void;                   // browser history back
  forward: () => void;               // browser history forward
  refresh: () => void;               // native router.refresh()
  fsBack: () => void;                 // nearest existing ancestor
  pop: () => void;                    // alias of fsBack
};
```

Wraps `next/navigation`'s `useRouter`/`usePathname`. `push`/`replace`/`prefetch`
resolve their target against the current pathname via `resolvePath`;
`back`/`forward`/`refresh` delegate to the native router unchanged.

The untouched Next router is always available as **`.router`**, so this is a
strict superset — use it for anything not wrapped here (options like
`{ scroll: false }`, `prefetch` with native semantics, etc.):

```ts
const nav = useSmartRouter();
nav.push("../settings");                         // smart, relative
nav.router.push("/dashboard", { scroll: false }); // native escape hatch
nav.router.refresh();
```

**Types:** `SmartRouter`, `NextAppRouter`.

#### vs. Next's `useRouter`

`useSmartRouter` is a strict superset of `next/navigation`'s `useRouter`:

| | Next `useRouter()` | `useSmartRouter()` |
| --- | --- | --- |
| `push(href)` | absolute href only | relative-aware + absolute |
| `replace(href)` | absolute href only | relative-aware + absolute |
| `prefetch(href)` | absolute href only | relative-aware + absolute |
| `back()` / `forward()` / `refresh()` | ✅ | ✅ (delegates to `.router`) |
| current pathname | separate `usePathname()` | `.pathname` included |
| the native router instance | is the router | `.router` (the exact `useRouter()` value) |
| `fsBack()` / `pop()` | ❌ | up to the nearest *real* route — never 404 |

Relative-aware methods resolve their argument against `.pathname` via
`resolvePath`; everything else delegates to the native router unchanged.

### Native `next/navigation` hooks (re-exported)

For convenience, the client entry re-exports the native hooks so you can import
everything from one place:

```ts
import {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
} from "next-smart-router/react";
```

These are the exact hooks from `next/navigation` — no wrapping.

---

## In-memory history — `smartHistory`

A controllable back-stack independent of `window.history`.

```ts
smartHistory.init("/");     // reset to a single entry
smartHistory.push("/a");    // push
smartHistory.push("/a/b");
smartHistory.back();        // -> "/a"
smartHistory.current();     // -> "/a"
smartHistory.reset("/");    // alias of init
```

**Type:** `SmartHistory`.

---

## CLI module — `next-smart-router/cli`

### `generateRoutes(options?)`

```ts
function generateRoutes(options?: {
  appDir?: string; // default: <cwd>/app
  out?: string;    // default: <cwd>/route-manifest.ts
  log?: boolean;   // default: true
}): string[];
```

### `collectRoutes(appDir)`

```ts
function collectRoutes(appDir: string): string[];
```

Returns the sorted route patterns without writing a file.
