# next-smart-router

[![npm version](https://img.shields.io/npm/v/next-smart-router.svg)](https://www.npmjs.com/package/next-smart-router)
[![npm downloads](https://img.shields.io/npm/dm/next-smart-router.svg)](https://www.npmjs.com/package/next-smart-router)
[![license](https://img.shields.io/npm/l/next-smart-router.svg)](./LICENSE)

A routing layer for the Next.js App Router, built on one idea: your `app/`
directory already describes every route in the application, so the router
should be able to answer questions about it.

Think of your routes like a Unix filesystem — navigate with `../` and `./`,
walk up to the nearest real route, list a route's children — and treat the URL
as state you can read and write with types.

- 🧭 **Relative navigation** — `nav.push("../settings")`, in code _and_ in markup
- 🏷️ **Typed routes & params** — inferred from the pattern, checked at compile time
- 🔗 **Query params as state** — `useQueryState`, batched writes, optional shallow
- 📌 **Sticky params** — `locale` and `utm_*` follow every navigation, `page` doesn't
- 📦 **Screen-to-screen data** — hand a payload to the next screen, safely
- 🌳 **Route tree** — nav menus that write themselves from the filesystem
- 🍞 **Breadcrumbs** — real ancestors, decoded, with labels you control
- ⬆️ **Safe back** — `fsBack()` lands on the nearest existing route, never a 404
- 🛡️ **Guards, events, devtools** — unsaved-changes blocking, analytics by pattern
- 🔌 **Native escape hatch** — the raw `next/navigation` router is always on `.router`
- 🪶 **Zero runtime deps** — `next` and `react` are optional peers

```bash
npm install next-smart-router
```

---

## Quick start

**1. Generate a manifest.** The plugin does it on `next dev` and `next build`,
and keeps it fresh while you work:

```js
// next.config.mjs
import { withSmartRouter } from "next-smart-router/plugin";

export default withSmartRouter({/* your normal Next config */});
```

<details>
<summary>Or run the CLI yourself</summary>

```bash
npx next-smart-router generate --app-dir src/app --out src/route-manifest.ts
npx next-smart-router generate --watch     # during dev
npx next-smart-router generate --check     # in CI, fails if stale
```

</details>

**2. Initialize once**, from a module both the server and client graphs import:

```ts
import { initializeSmartRouter } from "next-smart-router";
import { ROUTES, META } from "@/route-manifest";

initializeSmartRouter({
  routes: ROUTES,
  meta: META,
  stickyQuery: ["locale", /^utm_/],
});
```

**3. Register the route union** for typed routes everywhere (optional but
recommended):

```ts
// smart-router.d.ts
import type { Route } from "@/route-manifest";

declare module "next-smart-router" {
  interface Register {
    route: Route;
  }
}
```

---

## What you get

### Relative navigation, in code and in markup

```tsx
const nav = useSmartRouter();

nav.push("../members"); // resolved against the current path
nav.push("./edit", { scroll: false });
nav.sibling("settings");
nav.up(2); // two levels up, landing on a real route
nav.fsBack(); // nearest existing ancestor — never a 404

<SmartLink href="../members" activeClassName="is-active">
  Members
</SmartLink>;
```

`nav.router` is always the untouched Next router, so this is strictly a
superset.

### Typed routes and hrefs

```ts
buildHref("/w/[id]/docs/[...slug]", { id: 42, slug: ["getting started"] });
// → "/w/42/docs/getting%20started"

buildHref("/w/[typo]", { id: 42 });
// ✗ Argument of type '"/w/[typo]"' is not assignable to parameter of type Route

const { id, slug } = getParams("/w/[id]/docs/[...slug]");
//      ^? string  ^? string[]
```

Every segment is encoded, so a param containing `/`, `?` or `#` cannot break
out of its slot. Missing params throw instead of producing a URL with a
literal `[id]` in it.

### Query params as state

```tsx
// One param, typed, with a default
const [page, setPage] = useQueryState("page", parseAsInt.default(1));

// Several params in ONE navigation, not one per key
const [filters, setFilters] = useQueryStates({
  tab: parseAsEnum(["overview", "members"]).default("overview"),
  page: parseAsInt.default(1).clearOnDefault(),
});
setFilters({ tab: "members", page: 1 });

// Client-side filtering with no RSC round-trip per keystroke
const [q, setQ] = useQueryState("q", parseAsString.default(""), {
  shallow: true,
  throttleMs: 200,
});
```

Parsers never throw — a hand-edited URL falls back to the default rather than
white-screening the app.

**One definition, both runtimes:**

```ts
// app/w/[id]/search-params.ts
export const workspaceSearch = defineSearchParams({
  tab: parseAsEnum(["overview", "members"]).default("overview"),
  page: parseAsInt.default(1),
});

// server component
const { tab, page } = workspaceSearch.parse(searchParams);

// client component — same definition, no drift
const [{ tab, page }, set] = useQueryStates(workspaceSearch);
```

### Sticky query params

Some params are screen-local (`page`, `sort`) and should die on navigation.
Others are session-scoped (`locale`, `ref`, `utm_*`) and must survive every
link. Declare it once:

```ts
initializeSmartRouter({ routes: ROUTES, stickyQuery: ["locale", /^utm_/] });
```

```
on /w/42?locale=fr&utm_source=x&page=3
nav.push("../members")  →  /w/42/members?locale=fr&utm_source=x
```

`<SmartLink>` inherits this, so the policy holds in markup too — which is the
part that can't be done by hand without touching every link in the app.

### Handing data to the next screen

```tsx
// Screen A
nav.push("/checkout", {
  state: { cart },
  flash: { type: "success", message: "Cart saved" },
});

// Screen B
const state = useRouteState<{ cart: Cart }>();
```

> **The contract:** `useRouteState` returns `undefined` on the server render and
> on every cold entry — a direct link, a refresh, a shared URL. That is not a
> bug to work around. Treat it as a hydration hint for data you would fetch
> anyway:
>
> ```ts
> const { data } = useQuery({
>   queryKey: ["order", id],
>   queryFn: () => fetchOrder(id),
>   initialData: state?.order, // skips the spinner, nothing more
> });
> ```

Four backing stores, chosen per app or per call:

| Strategy              | Survives refresh | Back / forward    | Shared link | Clean URL       | Size      |
| --------------------- | ---------------- | ----------------- | ----------- | --------------- | --------- |
| `memory`              | ✗                | ✗                 | ✗           | ✓               | unbounded |
| `session` _(default)_ | ✓                | ✓ last-write-wins | ✗           | ✓               | ~5 MB     |
| `url-key`             | ✓                | ✓ exact per entry | ✗           | adds `?_nsr=`   | ~5 MB     |
| `query`               | ✓                | ✓                 | ✓           | encodes payload | ~2 KB     |

Payloads expire (`ttlMs`), evict (`maxEntries`), and cap (`maxBytes`); dev
warns about values that won't survive serialization.

### Navigation built from the filesystem

```tsx
function WorkspaceTabs() {
  const tabs = useChildren("./");

  return tabs.map((tab) => (
    <SmartLink key={tab.path} href={`./${tab.segment}`} activeClassName="on">
      {tab.meta?.title ?? tab.segment}
    </SmartLink>
  ));
}
```

Add `app/w/[id]/billing/page.tsx` and the tab appears. There is no menu array
to keep in sync.

### Breadcrumbs that are actually renderable

```ts
getBreadcrumbs("/w/42/settings", {
  labels: { "42": workspace.name },
  format: "title",
});
// [{ label: "W",        href: "/w",             pattern: "/w" },
//  { label: "Acme Inc", href: "/w/42",          pattern: "/w/[id]", param: "id" },
//  { label: "Settings", href: "/w/42/settings", isCurrent: true }]
```

### Route protection next to the page it protects

```json
// app/w/[id]/settings/route.meta.json
{ "title": "Settings", "requiresAuth": true, "roles": ["owner", "admin"] }
```

```ts
// middleware.ts — createRouter is pure, so it runs on the edge with no setup
import { createRouter } from "next-smart-router";
import { ROUTES, META } from "@/route-manifest";

const router = createRouter(ROUTES, { meta: META });

export function middleware(request: NextRequest) {
  const match = router.match(request.nextUrl.pathname);
  if (match?.meta?.requiresAuth && !getSession(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
```

### Guards, events, devtools

```tsx
// Blocks nav.push / SmartLink clicks; beforeunload covers hard navigation.
useNavigationGuard({ when: form.formState.isDirty });

// Analytics keyed by pattern, not by URL: /w/[id]/settings × 10,000
// instead of 10,000 distinct rows.
subscribeNavigation((e) => analytics.page(e.route, { ...e.params, ...e.search }));

{
  process.env.NODE_ENV === "development" && <SmartRouterDevtools />;
}
```

The devtools panel shows the matched pattern, its specificity rank, params,
sticky params, the transfer payload, and — the useful one — which other
patterns also matched but lost.

---

## vs. Next's `useRouter`

`useSmartRouter` is a **thin superset** of `next/navigation`'s `useRouter`. It
keeps every native method and adds the pieces `useRouter` leaves to you. The raw
Next router is always on `.router`, so you lose nothing by switching.

### Method-by-method

|                                        | Next `useRouter()`       | `useSmartRouter()`                                         |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| `push(href)`                           | absolute href only       | **relative-aware** (`"../settings"`, `"./new"`) + absolute |
| `replace(href)`                        | absolute href only       | **relative-aware** + absolute                              |
| `prefetch(href)`                       | absolute href only       | **relative-aware** + absolute                              |
| `back()` / `forward()` / `refresh()`   | ✅                       | ✅ (delegates)                                             |
| navigation options                     | `{ scroll }`             | `{ scroll, query, keepQuery, state, flash, shallow }`      |
| current pathname                       | separate `usePathname()` | `.pathname` included                                       |
| referential stability                  | n/a                      | every method memoized — safe as an effect dep              |
| the native router                      | —                        | `.router` (the exact `useRouter()` instance)               |
| **`fsBack()` / `up(n)`**               | ❌                       | up to the nearest _real_ route — never 404                 |
| **`sibling()` / `child()` / `root()`** | ❌                       | relative navigation vocabulary                             |
| **`canNavigate()` / `pushIfExists()`** | ❌                       | check the manifest before moving                           |

### Things `useRouter` doesn't do at all

`useRouter` is navigation-only. These have no equivalent in `next/navigation`,
and are why the library exists:

| Need                                 | With `next/navigation`                                                     | With next-smart-router                                  |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Move relative to where you are**   | Rebuild the absolute path from `usePathname()` and normalize `..` by hand. | `nav.push("../settings")`                               |
| **Relative hrefs in markup**         | `<Link>` is absolute-only.                                                 | `<SmartLink href="../members">`                         |
| **A back button that never 404s**    | `router.back()` can leave your app or land on a deleted route.             | `nav.fsBack()` walks up to the nearest _real_ route.    |
| **Build an href from a pattern**     | Template literals, and remember to encode.                                 | `buildHref("/w/[id]", { id: 42 })` — typed and encoded. |
| **Active-link state**                | Hand-rolled `startsWith`, which matches `/settings-v2`.                    | `isActive()` — prefix-safe and pattern-aware.           |
| **Write a query param**              | Rebuild `URLSearchParams`, re-concat the pathname, pick a history mode.    | `useQueryState("page", parseAsInt.default(1))`          |
| **Change several params at once**    | Three setters, three navigations, two wrong renders.                       | `useQueryStates({...})` — one navigation.               |
| **Carry `locale` across every link** | Remember it at every call site and every `<Link>`.                         | `stickyQuery: ["locale"]`, declared once.               |
| **Hand data to the next screen**     | A global store that outlives the navigation, or refetch.                   | `nav.push(href, { state })` + `useRouteState()`         |
| **Breadcrumbs**                      | Hand-write trail logic per layout; it drifts from real routes.             | `getBreadcrumbs(pathname)` — matchable ancestors only.  |
| **A menu from the filesystem**       | Maintain an array beside the folders.                                      | `useChildren("./")`                                     |
| **Read params away from a page**     | `useParams` only works inside the route tree.                              | `getParams("/w/[id]", { pathname })` anywhere.          |
| **Route metadata in middleware**     | A regex matcher array that drifts.                                         | `route.meta.json` + `createRouter().match()`            |
| **Block navigation on a dirty form** | `router.events` was removed and never replaced.                            | `useNavigationGuard({ when })`                          |
| **Analytics by route, not by URL**   | One row per concrete URL.                                                  | `subscribeNavigation()` gives the pattern.              |
| **Know all your routes at runtime**  | No registry of route patterns.                                             | Generated manifest + registry, or `createRouter()`.     |

### Side by side

```ts
// next/navigation — you assemble the target yourself
import { useRouter, usePathname } from "next/navigation";
const router = useRouter();
const pathname = usePathname(); // /workspaces/42/overview
router.push(pathname.replace(/\/[^/]+$/, "/settings"));

// next-smart-router — relative, plus the native router still on hand
import { useSmartRouter } from "next-smart-router/react";
const nav = useSmartRouter();
nav.push("../settings");
nav.router.refresh(); // native escape hatch
```

### When plain `useRouter` is enough

Genuinely — don't add a dependency you don't need:

- You only ever navigate with absolute paths, and never read the query.
- You only need params inside a page or layout; Next's `useParams` covers that.
- You want routes checked at _compile_ time only → Next's `typedRoutes` is
  built in. This library also checks at compile time once you register the
  route union, but it costs a generated manifest to get there.
- Query params are your only pain point → [`nuqs`](https://nuqs.dev) is a
  smaller, focused dependency. The overlap here exists so query state composes
  with relative navigation, sticky params and `SmartLink`.

## A note on Suspense

`useQueryState`, `useQueryStates` and `useRoute` read `useSearchParams()` so
their values are correct during SSR. That opts a page into Next's
client-rendering bailout, exactly as calling `useSearchParams()` directly does,
so a **statically prerendered** page needs a `<Suspense>` boundary around the
component using them.

`useRouteState`, `useRouteStateOr`, `useClearRouteState` and `useFlash` do
**not**, because they are `undefined` on the server by contract and have
nothing to gain from the router's snapshot.

---

## Limitations & known trade-offs

Worth knowing before adopting. Details in [FAQ](./docs/faq.md) and
[Concepts](./docs/concepts.md).

- **The manifest is a build-time snapshot.** Add a route folder and it has to be
  regenerated. The [plugin](./docs/cli.md#the-plugin) does this on `next dev`
  and `next build` so you rarely think about it, but nothing updates the
  registry at runtime on its own — and `--check` in CI is what catches drift.
- **You must `initializeSmartRouter()` once, per module graph.** Next builds the
  server and client separately, so a call that only runs in a client provider
  leaves Server Components with an empty registry. It warns once in development
  rather than failing quietly. `createRouter()` sidesteps this by carrying its
  routes explicitly — prefer it in middleware and RSC.
- **`resolvePath` is pure string math.** `push("../x")` resolves the path; it
  does not verify the target exists. Use `nav.canNavigate(target)` or
  `nav.pushIfExists(target, { fallback })` when you need certainty.
- **Typed routes are opt-in.** Until you augment `Register` with the generated
  union, `Route` is `string` and a typo in a pattern is a runtime `undefined`
  rather than a compile error.
- **Transfer state is never authoritative.** `useRouteState()` returns
  `undefined` on the server render and on every cold entry — direct link,
  refresh, shared URL. The destination screen must work without it; treat it as
  a hydration hint, not a data source.
- **`fsBack` walks the _path_, not browser history.** That is the point, and it
  is deliberately not the same as pressing back — use `nav.back()` for that.
- **Query hooks impose Next's Suspense rule.** `useQueryState`, `useQueryStates`
  and `useRoute` read `useSearchParams()`, so a statically prerendered page
  needs a `<Suspense>` boundary. The transfer hooks don't.
- **Navigation guards can't fully catch the browser back button.** Library
  navigations and `<SmartLink>` clicks are covered; hard navigation falls back
  to `beforeunload`. Back needs `interceptBrowserBack`, off by default.
- **Route metadata sidecars are JSON only.** `route.meta.json` is read
  statically; a `route.meta.ts` would need a loader in the CLI.

<details>
<summary>Fixed in 1.0 — if you read this list before, three entries are gone</summary>

- ~~First registered match wins; overlapping patterns are ambiguous.~~ Matching
  now follows Next.js specificity (static > dynamic > catch-all > optional
  catch-all), so `/docs/about` beats `/docs/[...slug]` deterministically.
- ~~Runtime, not compile-time, param typing.~~ Register the generated `Route`
  union and params are inferred from the pattern.
- ~~Breadcrumb labels are raw slugs.~~ Decoded, with `labels`, `labelFor`,
  `format` and `isCurrent`.

See [docs/migration-1.0.md](./docs/migration-1.0.md).

</details>

## API

<details>
<summary><b>Setup</b></summary>

`initializeSmartRouter` · `resetSmartRouter` · `isSmartRouterInitialized` ·
`getConfig` · `setConfig` · `setRoutes` · `setRouteMeta` · `getRoutes` ·
`getOrderedRoutes` · `getStaticRoutes` · `getRouteState` · `hasRoutes` ·
`clearRoutes`

</details>

<details>
<summary><b>Matching &amp; building</b></summary>

`matchRoute` · `matchRouteIn` · `matchRoutePattern` · `matchPatternParams` ·
`routeExists` · `getParams` · `buildHref` · `tryBuildHref` · `isActive` ·
`resolvePath` · `resolveUp` · `fsBackPathSafe` · `getNearestStaticRoute` ·
`getBreadcrumbs` · `createRouter` · `validateRoutes`

</details>

<details>
<summary><b>Route tree</b></summary>

`getRouteTree` · `getRouteNode` · `getChildren` · `getSiblings` · `getParent` ·
`getDepth` · `getDescendants`

</details>

<details>
<summary><b>URL &amp; query</b></summary>

`splitUrl` · `toPathname` · `parseQuery` · `buildQuery` · `withQuery` ·
`setQuery` · `pickQuery` · `omitQuery` · `mergeQuery` · `selectQuery` ·
`normalizePath` · `applyBasePath` · `applyTrailingSlash`

`createParser` · `defineSearchParams` · `parseAsString` · `parseAsInt` ·
`parseAsFloat` · `parseAsBoolean` · `parseAsIsoDate` · `parseAsDateOnly` ·
`parseAsEnum` · `parseAsArrayOf` · `parseAsJson` · `parseAsSortOrder`

</details>

<details>
<summary><b>Transfer &amp; events</b></summary>

`writeTransfer` · `readTransfer` · `clearTransfer` · `clearTransferFor` ·
`writeFlash` · `consumeFlash` · `peekFlash` · `subscribeNavigation` ·
`onBeforeNavigate` · `createSmartHistory`

</details>

<details>
<summary><b>React entry — <code>next-smart-router/react</code></b></summary>

`useSmartRouter` · `useRoute` · `useIsActive` · `useBreadcrumbs` ·
`useQueryState` · `useQueryStates` · `useSearchParamsObject` ·
`useRouteState` · `useRouteStateOr` · `useClearRouteState` · `useFlash` ·
`useRouteTree` · `useChildren` · `useSiblings` · `useNavigationGuard` ·
`SmartHistoryProvider` · `useSmartHistory` · `SmartLink` ·
`SmartRouterDevtools`

Plus `useRouter`, `usePathname`, `useSearchParams` and `useParams` re-exported
from `next/navigation`.

</details>

---

## Configuration

```ts
initializeSmartRouter({
  routes: ROUTES,
  meta: META,

  basePath: "/app", // mirrors next.config
  trailingSlash: false,
  locales: ["en", "fr"], // stripped before matching

  stickyQuery: ["locale", /^utm_/],

  transfer: {
    strategy: "session", // memory | session | url-key | query
    ttlMs: 5 * 60_000,
    maxEntries: 20,
    maxBytes: 256 * 1024,
    onOverflow: "warn", // warn | throw | drop
    namespace: "acme",
  },

  scrollRestoration: "auto",
  focusOnNavigate: "main",
  announceNavigation: true,
  interceptBrowserBack: false,
});
```

---

## Example app

[`examples/playground`](./examples/playground) is a real Next.js app using every
feature. CI installs the packed tarball into it and runs `next build`, which is
what proves the exports map and the `"use client"` boundary work outside this
repo.

## Docs

[Getting started](./docs/getting-started.md) ·
[Concepts](./docs/concepts.md) ·
[API reference](./docs/api-reference.md) ·
[Recipes](./docs/recipes.md) ·
[CLI](./docs/cli.md) ·
[FAQ](./docs/faq.md) ·
[Migrating to 1.0](./docs/migration-1.0.md)

## Contributing & releasing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup, project layout and
the invariants worth knowing before changing the core.

```bash
npm install
npm test          # 178 tests
npm run build     # ESM + CJS + types, then re-adds "use client"
npm run lint:package
```

Releases run on [Changesets](https://github.com/changesets/changesets), so the
version bump follows the change instead of always being a patch:

```bash
npx changeset     # patch | minor | major + a one-line summary
```

Commit the generated file with your PR. On merge to `main`, CI publishes to npm
via OIDC trusted publishing — there is no token to rotate.

## License

MIT
