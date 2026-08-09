# next-smart-router

A routing layer for the Next.js App Router, built on one idea: your `app/`
directory already describes every route in the application, so the router
should be able to answer questions about it.

Relative navigation. Typed routes and params. Query params as state. Data
handed from one screen to the next. Breadcrumbs, route trees, back that never
404s — all derived from a manifest generated out of the filesystem.

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

## License

MIT
