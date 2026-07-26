# Why next-smart-router?

## The problem

`useRouter` from `next/navigation` is deliberately navigation-only and
absolute-path-only. Several everyday routing tasks have no first-class answer,
so teams re-implement them per project. next-smart-router is a **thin superset**
of that router — every native method still works (and the raw router is on
`.router`); it just fills the gaps below.

> Throughout, "Next router" means `useRouter()` / the `next/navigation` hooks.

### At a glance

| Capability | Next router (`useRouter`/`next/navigation`) | next-smart-router |
| --- | --- | --- |
| `push`/`replace`/`prefetch` | absolute href only | relative-aware **and** absolute |
| `back`/`forward`/`refresh` | ✅ | ✅ (delegates to `.router`) |
| Nearest-real-route "up" | ❌ | `fsBack()` / `pop()` |
| Breadcrumbs from a path | ❌ | `getBreadcrumbs()` |
| Typed params from any pathname | only `useParams` inside the tree | `getParams()` anywhere |
| Nearest static route | ❌ | `getNearestStaticRoute()` |
| Runtime route registry | ❌ | generated manifest + registry |
| Native router access | is the router | `.router` (unchanged) |

### 1. Relative navigation

Next's `router.push` takes an **absolute** href only — there's no "go up one
level" or "go to a sibling". You reconstruct the target from `usePathname()` and
normalize `..`/`.` yourself:

```ts
// next/navigation
import { useRouter, usePathname } from "next/navigation";
const router = useRouter();
const pathname = usePathname();               // /workspaces/42/overview
const target = pathname.split("/").slice(0, -1).join("/") + "/settings";
router.push(target);                           // /workspaces/42/settings
```

```ts
// next-smart-router
useSmartRouter().push("../settings");          // relative; .router still available
```

### 2. "Back" / "Up" that can't 404

`router.back()` uses browser history — it can leave your site entirely, or land
on a route that no longer exists. There's no built-in "go up to the nearest
page that actually exists".

```ts
useSmartRouter().fsBack();  // walks the path up to the nearest real route
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

Next has no runtime registry of route *patterns*. Matching, breadcrumbs and
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

## When *not* to

- You only navigate with absolute paths → plain `useRouter` suffices.
- You only need params inside a page/layout → Next's `useParams` covers it.
- You want routes validated at **compile** time → Next's experimental
  `typedRoutes` is a better fit; this library validates at **runtime**.

## Known trade-offs

next-smart-router is intentionally small; understand these before adopting:

| Trade-off | What it means | Mitigation |
| --- | --- | --- |
| Manifest is a build-time snapshot | New route folders don't register until you regenerate. | Wire `predev`/`prebuild` (see [CLI](./cli.md#keep-it-in-sync)). |
| Requires one-time init | Registry-backed helpers only know `/` before `initializeSmartRouter`. | Call it in a root client component. |
| `resolvePath` doesn't validate | `push("../x")` won't confirm `x` exists. | Guard with `matchRoute(target)`. |
| Runtime param typing | `getParams<["id"]>()` trusts the keys you pass. | Keep keys in sync with routes; add tests. |
| First match wins | Overlapping patterns (static vs `[slug]`) resolve to the first registered. | The CLI sorts routes (static tends to sort first); avoid ambiguous overlaps. |
| `fsBack` ≠ browser back | It walks the path, not history. | Use `back()`/`nav.router.back()` for true history. |

See [FAQ & Troubleshooting](./faq.md) for symptom-first guidance.
