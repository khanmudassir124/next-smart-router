# Why next-smart-router?

## The problem

`useRouter` from `next/navigation` is deliberately navigation-only and
absolute-path-only. Several everyday routing tasks have no first-class answer,
so teams re-implement them per project. next-smart-router is a **thin superset**
of that router — every native method still works (and the raw router is on
`.router`); it just fills the gaps below.

> Throughout, "Next router" means `useRouter()` / the `next/navigation` hooks.

### At a glance

| Capability                     | Next router (`useRouter`/`next/navigation`) | next-smart-router                  |
| ------------------------------ | ------------------------------------------- | ---------------------------------- |
| `push`/`replace`/`prefetch`    | absolute href only                          | relative-aware **and** absolute    |
| `back`/`forward`/`refresh`     | ✅                                          | ✅ (delegates to `.router`)        |
| Nearest-real-route "up"        | ❌                                          | `fsBack()` / `pop()`               |
| Breadcrumbs from a path        | ❌                                          | `getBreadcrumbs()`                 |
| Typed params from any pathname | only `useParams` inside the tree            | `getParams()` anywhere             |
| Nearest static route           | ❌                                          | `getNearestStaticRoute()`          |
| Runtime route registry         | ❌                                          | generated manifest + registry      |
| Build an href from a pattern   | ❌                                          | `buildHref()`, encoded + typed     |
| Active-link state              | hand-rolled `startsWith`                    | `isActive()` / `useIsActive()`     |
| Relative hrefs in markup       | ❌ (`<Link>` is absolute)                   | `<SmartLink>`                      |
| Query params as state          | read-only `useSearchParams`                 | `useQueryState` / `useQueryStates` |
| Carry params across screens    | ❌                                          | `stickyQuery`                      |
| Hand data to the next screen   | ❌                                          | `push(href, { state })`            |
| Navigation events              | removed in the App Router                   | `subscribeNavigation()`            |
| Block a navigation             | ❌                                          | `useNavigationGuard()`             |
| Nav menus from the filesystem  | ❌                                          | `useChildren()` / route tree       |
| Routing in `middleware.ts`     | manual regex matcher                        | `createRouter()` + route meta      |
| Native router access           | is the router                               | `.router` (unchanged)              |

### 1. Relative navigation

Next's `router.push` takes an **absolute** href only — there's no "go up one
level" or "go to a sibling". You reconstruct the target from `usePathname()` and
normalize `..`/`.` yourself:

```ts
// next/navigation
import { useRouter, usePathname } from "next/navigation";
const router = useRouter();
const pathname = usePathname(); // /workspaces/42/overview
const target = pathname.split("/").slice(0, -1).join("/") + "/settings";
router.push(target); // /workspaces/42/settings
```

```ts
// next-smart-router
useSmartRouter().push("../settings"); // relative; .router still available
```

### 2. "Back" / "Up" that can't 404

`router.back()` uses browser history — it can leave your site entirely, or land
on a route that no longer exists. There's no built-in "go up to the nearest
page that actually exists".

```ts
useSmartRouter().fsBack(); // walks the path up to the nearest real route
```

### 3. Breadcrumbs

Every app rebuilds breadcrumb logic in a layout, and it silently drifts from the
real route tree (showing crumbs for segments that aren't pages).

```ts
getBreadcrumbs("/workspaces/42/settings"); // only matchable ancestors
```

### 4. Params outside a page

`useParams()` only works inside the route subtree. In middleware, edge
functions, loggers, or analytics you often have just a raw pathname string and
no typed way to pull ids out of it.

```ts
getParams<["id"]>({ pathname }); // works anywhere, typed
```

### 5. "Redirect somewhere safe"

When redirecting across domains/tenants, the dynamic ids in the current path
aren't valid on the target. You strip them by hand.

```ts
getNearestStaticRoute(pathname); // nearest ancestor with no [dynamic] segments
```

### 6. No runtime knowledge of your routes

Next has no runtime registry of route _patterns_. Matching, breadcrumbs and
param extraction all need one — so this library generates it from your `app/`
directory and keeps it in a small, lazily-read registry.

## The approach

- A **build-time CLI** walks `app/` and emits a manifest of route patterns
  (dynamic segments preserved), honoring Next conventions (route groups,
  `api`/private/parallel folders).
- `initializeSmartRouter({ routes })` loads that manifest into an in-memory
  **registry**, read lazily by every helper.
- The **core** (`next-smart-router`) is framework-agnostic and imports neither
  React nor Next — usable in RSC, middleware, tests, or other frameworks.
- The **client hook** (`next-smart-router/react`) is a thin superset of
  `next/navigation`: relative-aware `push`/`replace`/`prefetch` plus the raw
  `.router`, so you never lose native capability.

## When to use it

Reach for next-smart-router when you have **nested, dynamic route trees** and
want relative navigation, safe "up" buttons, breadcrumbs, or path-based param
extraction without hand-rolling each one.

## When _not_ to

- You only navigate with absolute paths → plain `useRouter` suffices.
- You only need params inside a page/layout → Next's `useParams` covers it.
- You want routes validated at **compile** time → Next's experimental
  `typedRoutes` is a better fit; this library validates at **runtime**.

## Known trade-offs

next-smart-router is intentionally small; understand these before adopting:

| Trade-off                         | What it means                                                              | Mitigation                                                                   |
| --------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Manifest is a build-time snapshot | New route folders don't register until you regenerate.                     | Wire `predev`/`prebuild` (see [CLI](./cli.md#keep-it-in-sync)).              |
| Requires one-time init            | Registry-backed helpers only know `/` before `initializeSmartRouter`.      | Call it in a root client component.                                          |
| `resolvePath` doesn't validate    | `push("../x")` won't confirm `x` exists.                                   | Guard with `matchRoute(target)`.                                             |
| Runtime param typing              | `getParams<["id"]>()` trusts the keys you pass.                            | Keep keys in sync with routes; add tests.                                    |
| First match wins                  | Overlapping patterns (static vs `[slug]`) resolve to the first registered. | The CLI sorts routes (static tends to sort first); avoid ambiguous overlaps. |
| `fsBack` ≠ browser back           | It walks the path, not history.                                            | Use `back()`/`nav.router.back()` for true history.                           |

See [FAQ & Troubleshooting](./faq.md) for symptom-first guidance.

## What 1.0 added, and why

The first four gaps above are what the library started as. Three more turned up
often enough to be worth solving in the same place, because each one needs the
route manifest to do properly:

**Query params as state.** The App Router gives you a read-only, string-typed
`useSearchParams()` and nothing else. Writing back means rebuilding a
`URLSearchParams`, re-concatenating the pathname and picking a history mode by
hand, at every call site. Doing it here means query state composes with relative
navigation and `<SmartLink>` — which is what makes `stickyQuery` possible at
all, since a policy that only works in `nav.push()` leaks the first time
somebody adds a link.

**Handing data between screens.** React Navigation has `navigate(screen,
params)`. The App Router has the URL, so teams reach for a global store that
outlives the navigation, or refetch data the previous screen already had. A
payload scoped to one navigation, that expires and cleans itself up, is the
missing middle — as long as it is never load-bearing. See
[the transfer contract](./concepts.md#the-transfer-contract).

**The route tree.** Once the manifest exists, "what are this route's children?"
is answerable, and a tab bar or sidebar can be derived from the filesystem
instead of hand-maintained beside it. This is the cheapest feature in the
library relative to what it removes.

## What it deliberately isn't

- **Not a replacement for `next/navigation`.** Every native method still works
  and the raw router is always on `.router`.
- **Not a data-fetching layer.** Transfer state is a hydration hint, never a
  source of truth.
- **Not schema-first.** Your `app/` directory stays authoritative; the manifest
  is generated from it. If you'd rather declare routes in code and derive the
  filesystem from that, a schema-first library is the better fit — see the
  [FAQ](./faq.md#how-does-this-compare-to).
