# API reference

Two entry points:

- **`next-smart-router`** — pure, no React or Next imports. Safe in Server
  Components, Route Handlers, `middleware.ts`, tests and Node scripts.
- **`next-smart-router/react`** — hooks and components. Client-only.

Plus `next-smart-router/plugin` (Next config wrapper) and
`next-smart-router/cli` (programmatic generator).

---

## Setup

### `initializeSmartRouter(options)`

```ts
initializeSmartRouter({
  routes: ROUTES, // Iterable<string> — required
  meta: META, // RouteMetaMap
  force: false, // re-initialize (tests, HMR)

  basePath: "/app",
  trailingSlash: false,
  locales: ["en", "fr"],
  stickyQuery: ["locale", /^utm_/],

  transfer: {
    strategy: "session", // "memory" | "session" | "url-key" | "query"
    ttlMs: 300_000,
    maxEntries: 20,
    maxBytes: 262_144,
    onOverflow: "warn", // "warn" | "throw" | "drop"
    namespace: "nsr",
  },

  scrollRestoration: "auto", // "auto" | "top" | "manual"
  focusOnNavigate: "main", // selector | false
  announceNavigation: false,
  interceptBrowserBack: false,
});
```

Idempotent unless `force` is set.

### Registry

| Export                                          | Returns                                        |
| ----------------------------------------------- | ---------------------------------------------- |
| `resetSmartRouter()`                            | Clears routes, config and the initialized flag |
| `isSmartRouterInitialized()`                    | `boolean`                                      |
| `setRoutes(routes, meta?)`                      | Replaces the route set, re-deriving order      |
| `setRouteMeta(meta)`                            | Replaces metadata only                         |
| `getRoutes()`                                   | `Set<string>`                                  |
| `getOrderedRoutes()`                            | `readonly string[]` in specificity order       |
| `getStaticRoutes()`                             | Routes with no dynamic segment                 |
| `getRouteMetaMap()`                             | `RouteMetaMap`                                 |
| `getRouteState()`                               | The full derived `RouteState`                  |
| `hasRoutes()`                                   | `false` when only `"/"` is registered          |
| `clearRoutes()`                                 | Back to `"/"` only                             |
| `getConfig()` / `setConfig()` / `resetConfig()` | Global config                                  |

---

## Matching

### `matchRoute(path, routes?): RouteMatch | null`

```ts
matchRoute("/w/42/settings");
// { route: "/w/[id]/settings", params: { id: "42" }, meta?: {…} }
```

Tries candidates in specificity order. Query and hash on `path` are ignored.
Returns `null` when nothing matches — truthy/falsy, so `if (matchRoute(x))`
reads naturally.

| Related                             |                                           |
| ----------------------------------- | ----------------------------------------- |
| `routeExists(path)`                 | The `boolean` form                        |
| `matchRoutePattern(path, pattern)`  | Test one pattern                          |
| `matchPatternParams(path, pattern)` | `RouteParams \| null` for one pattern     |
| `matchRouteIn(state, path)`         | Pure form taking an explicit `RouteState` |

### `getParams(route?, options?)`

```ts
getParams("/w/[id]/docs/[...slug]"); // typed: { id: string; slug: string[] }
getParams<["id"]>({ pathname: "/w/42" }); // untyped, most specific route wins

getParams("/w/[id]", {
  pathname: "/w/42",
  coerce: { id: Number },
  assert: ["id"],
  schema: zodSchema, // any Standard Schema
});
```

Throws `SmartRouterParamError` on a failed `assert` or `schema`. Requires
`pathname` outside the browser.

### `createRouter(routes, options): SmartRouterInstance`

A pure instance with no globals.

```ts
const router = createRouter(ROUTES, { basePath: "/app", meta: META });
```

| Method                              |                                           |
| ----------------------------------- | ----------------------------------------- |
| `.match(path)`                      | `RouteMatch \| null`                      |
| `.exists(path)`                     | `boolean`                                 |
| `.params(path, route?)`             | Decoded params                            |
| `.build(route, params, options?)`   | Encoded href                              |
| `.resolve(current, target)`         | Relative resolution                       |
| `.fsBack(path, levels?)`            | Nearest existing ancestor                 |
| `.nearestStatic(path, options?)`    | Nearest ancestor with no dynamic segments |
| `.breadcrumbs(path, options?)`      | `Breadcrumb[]`                            |
| `.isActive(path, target, options?)` | `boolean`                                 |
| `.meta(route)`                      | `RouteMeta \| undefined`                  |
| `.withSticky(from, to)`             | Carries sticky params between two URLs    |
| `.normalize(path)`                  | Bare comparable pathname                  |
| `.state` / `.routes`                | The derived state / ordered patterns      |

### `validateRoutes(routes): RouteConflict[]`

Finds catch-alls that aren't final, conflicting dynamic segment names at one
level, and duplicates.

It can only see the route list it is given. Two folders resolving to the same
path collapse into one entry before they reach it, so that case is detected by
the CLI instead, from `collectRoutes(appDir).sources` — see
[the CLI docs](./cli.md#two-folders-one-path).

---

## Explaining a resolution

### `explainIn(state, href): RouteExplanation`

Why a URL resolved the way it did. Walks the ordered routes once and reports
the winner, everything that also matched and lost, and the reason each of the
rest was rejected.

```ts
const state = createRouteState(ROUTES);
const { winner, nearMisses, total } = explainIn(state, "/w/42/settings");

winner?.route; //  "/w/[id]/settings"
winner?.rank; //   3   (of `total`, in this library's specificity order)
nearMisses; //     [{ route: "/w/[id]/[tab]", params: { id: "42", tab: "settings" }, rank: 4 }]
```

Takes a `RouteState` rather than a route list, because `createRouteState` sorts
on every call and this runs on every navigation in the devtools overlay. Same
reason `matchRouteIn` takes state.

`winner.rank` is **this library's** ordering. Next groups routes by trie branch
and this compares segment ranks left to right, so the two orderings differ for
routes in different branches. They agree on which route _wins_; they disagree on
the position number. Label it as the library's rank if you show it to anyone.

Returns a `RouteExplanation`:

| Field         | Meaning                                                         |
| ------------- | --------------------------------------------------------------- |
| `winner`      | `ExplainedWinner` (`route`, `params`, `rank`, `meta`) or `null` |
| `candidates`  | Every route tried, in order, as `ExplainedCandidate`            |
| `nearMisses`  | `ExplainedNearMiss[]` — matched but lost, uncapped              |
| `stickyQuery` | What `stickyQuery` would carry across a navigation              |
| `total`       | How many patterns were considered; the denominator for `rank`   |

A rejected `ExplainedCandidate` carries a `RejectReason`: `"catch-all-not-last"`,
`"catch-all-empty"`, `"path-too-short"`, `"literal-mismatch"` or
`"path-too-long"`, plus the `atSegment` index that decided it.

### `explain(href, routes, options?): RouteExplanation`

Convenience wrapper that builds the state per call. Fine for one-offs; for
anything repeated, build the state once and use `explainIn`.

---

## Finding dead routes

### `findUnreachableRoutes(routes, options?): UnreachableRoute[]`

Route patterns that **no URL can reach**, because a more specific sibling
shadows them at every depth they could serve. Next does not report this, and it
is invisible in a folder tree: the page file exists, so the route looks fine.

```ts
findUnreachableRoutes(["/w/[id]", "/w/[other]"]);
// [{ route: "/w/[other]",
//    witnesses: [{ url: "/w/__nsr0", wonBy: "/w/[id]" }] }]
```

Each `UnreachableRoute` carries the `UnreachableWitness[]` that were tried and
what beat each one, so the result is a proof rather than an accusation.

The method is to synthesize witness URLs for a pattern and resolve them against
the whole set. Fillers are fresh tokens that collide with no static segment
anywhere in the set; catch-alls are witnessed one level deeper than the deepest
route; optional catch-alls keep their zero-segment form. A pattern is reported
only when every witness loses. Validated at zero false positives across 18,000+
route sets that Next's own sorter accepts, checked against exhaustive search.

> **This sees only the manifest.** A page reachable solely through a
> `next.config` rewrite or middleware has no witness here and will be reported.
> Say so wherever you surface the result, and check before deleting anything.

`options` is a `FindUnreachableOptions` — the same `basePath` / `locales` /
`stickyQuery` config `createRouteState` takes. Also surfaced by
`next-smart-router generate --check`, as a warning that does not change the exit
code.

---

## Building paths

### `buildHref(route, params, options?)`

```ts
buildHref("/w/[id]/docs/[...slug]", { id: 42, slug: ["a b"] });
// "/w/42/docs/a%20b"

buildHref(
  "/w/[id]",
  { id: 7 },
  {
    query: { tab: "members" },
    hash: "top",
    arrayFormat: "repeat", // or "comma"
    raw: false, // skip basePath / trailingSlash
  }
);
```

Every segment is `encodeURIComponent`'d. Throws `SmartRouterHrefError` on a
missing required param; `tryBuildHref` returns `null` instead.

### `resolvePath(current, target)` / `resolveUp(current, levels?)`

Unix-style resolution that understands query strings and hashes. See
[Concepts](./concepts.md#relative-paths).

### `isActive(pathname, target, options?)`

`target` may be an href or a pattern. `{ exact }` restricts to the exact path;
`{ matchQuery: [...] }` also compares those query keys. Never treats a shared
prefix as a parent (`/workspaces-archive` is not under `/workspaces`).

### `fsBackPathSafe(pathname, options?)`

`{ levels, keepSticky }`. Walks up to the nearest route that exists. Returns a
URL path, with the locale kept and `basePath` added. To navigate with the router, use
`nav.fsBack()`, which leaves `basePath` to Next.

### `getNearestStaticRoute(pathname, options?)`

`{ includeSelf }` — default `true`.

### `getBreadcrumbs(pathname, options?): Breadcrumb[]`

```ts
interface Breadcrumb {
  label: string;
  href: string;
  segment: string; // raw, decoded
  pattern: string; // "/w/[id]" — "" when unmatched
  param?: string; // when this segment filled a dynamic slot
  isCurrent: boolean;
  matched: boolean;
}
```

Options: `labels`, `labelFor`, `format` (`"raw" | "title" | "sentence"`),
`includeRoot`, `rootLabel`, `unmatched` (`"omit" | "text"`).

---

## Route tree

| Export                         | Returns                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `getRouteTree()`               | `RouteNode` rooted at `/`                                |
| `getRouteNode(route)`          | One node                                                 |
| `getChildren(route, options?)` | Direct children; `{ includeHidden, includePassthrough }` |
| `getSiblings(route, options?)` | Siblings, excluding itself                               |
| `getParent(route)`             | Parent pattern or `null`                                 |
| `getDepth(route)`              | Segment count                                            |
| `getDescendants(route)`        | Everything below, depth-first                            |

```ts
interface RouteNode {
  path: string; // "/w/[id]"
  segment: string; // "[id]"
  dynamic: boolean;
  param?: string;
  page: boolean; // false for pass-through folders
  meta?: RouteMeta;
  children: RouteNode[];
}
```

---

## URL & query

`splitUrl` · `toPathname` · `parseQuery` · `buildQuery` · `withQuery` ·
`setQuery` · `pickQuery` · `omitQuery` · `mergeQuery` · `selectQuery` ·
`normalizePath` · `applyBasePath` · `applyTrailingSlash`

```ts
withQuery("/w/42?tab=a&sort=x", { sort: "y", page: undefined });
// "/w/42?sort=y&tab=a"     — undefined deletes; keys are sorted
```

Key sorting is deliberate: two URLs holding the same state compare equal, which
matters for prefetch entries, cache keys and analytics rows.

`pickQuery` / `omitQuery` / `selectQuery` accept strings or regexes.

### Parsers

`parseAsString` · `parseAsInt` · `parseAsFloat` · `parseAsBoolean` ·
`parseAsIsoDate` · `parseAsDateOnly` · `parseAsEnum(values)` ·
`parseAsArrayOf(parser, { separator })` · `parseAsJson(validate?)` ·
`parseAsSortOrder` · `createParser({ parse, serialize, eq })`

Modifiers: `.default(value)` · `.clearOnDefault(enabled?)` ·
`.withOptions({ history, shallow, throttleMs, scroll })` · `.withEq(fn)`

`parse` never throws — malformed input falls back to the default.

### `defineSearchParams(parsers)`

`.parse(input)` accepts a Next `searchParams` object, `URLSearchParams` or a raw
string. `.serialize(values)` and `.href(path, values)` go the other way.

---

## Transfer & events

| Export                                                 |                                           |
| ------------------------------------------------------ | ----------------------------------------- |
| `writeTransfer(href, data, { strategy })`              | Returns the href to navigate to           |
| `readTransfer<T>(href)`                                | `T \| undefined`                          |
| `clearTransferFor(href)` / `clearTransfer()`           | Drop one / all                            |
| `subscribeTransfer(listener)`                          | Unsubscribe fn                            |
| `writeFlash(flash)` / `consumeFlash()` / `peekFlash()` | One-shot messages                         |
| `subscribeTransfer(listener)`                          | Unsubscribe fn                            |
| `subscribeNavigation(listener)`                        | `NavigationEvent` stream                  |
| `emitNavigation(event)`                                | Emit one (the hooks call this)            |
| `onBeforeNavigate(guard)`                              | Guard registration                        |
| `hasGuards()`                                          | `boolean`                                 |
| `runGuards(context)`                                   | `Promise<boolean>` — `false` if cancelled |
| `createSmartHistory(options)`                          | Isolated navigation stack                 |
| `TRANSFER_KEY_PARAM`                                   | `"_nsr"` — the `url-key` query key        |

```ts
interface NavigationEvent {
  type: "push" | "replace" | "back" | "forward" | "fsBack" | "query";
  from: string;
  to: string;
  route: string | null; // the matched PATTERN
  params: RouteParams;
  search: ParsedQuery;
  shallow: boolean;
}
```

---

## Segments & string utilities

Low-level helpers the matchers are built from. Exported because a consumer
writing their own tooling over the manifest needs the same primitives.

| Export                     | Returns                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `toSegments(path)`         | Non-empty path segments                                    |
| `isDynamic(seg)`           | `true` for `[id]` (and, loosely, any bracketed segment)    |
| `isCatchAll(seg)`          | `true` for `[...slug]`                                     |
| `isOptionalCatchAll(seg)`  | `true` for `[[...slug]]`                                   |
| `isStaticRoute(route)`     | `true` when the pattern has no dynamic segment             |
| `getParamName(seg)`        | `"[...slug]"` → `"slug"`                                   |
| `safeDecode(value)`        | `decodeURIComponent` that returns the raw value on failure |
| `segmentRank(seg)`         | `0` static · `1` dynamic · `2` catch-all · `3` optional    |
| `compareSpecificity(a, b)` | Sort comparator, most specific first                       |
| `titleCase(seg)`           | `"billing-plan"` → `"Billing Plan"`                        |
| `sentenceCase(seg)`        | `"billing-plan"` → `"Billing plan"`                        |

Check the specific predicates before the loose one — `isDynamic("[[...x]]")` is
also `true`, which is why the matchers test optional catch-all first.

---

## Constants

| Export               | What it is                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `DEFAULT_CONFIG`     | The `SmartRouterConfig` used before `initializeSmartRouter`       |
| `DEFAULT_TRANSFER`   | Its `transfer` block, broken out for merging                      |
| `TRANSFER_KEY_PARAM` | `"_nsr"` — the query key the `url-key` and `query` strategies use |

---

## Testing helpers

Module-level state is convenient in an app and hostile in a test suite. These
reset it; call them in `beforeEach`.

| Export                       | Resets                                    |
| ---------------------------- | ----------------------------------------- |
| `resetSmartRouter()`         | Routes, config and the initialized flag   |
| `clearRoutes()`              | Routes only, back to `"/"`                |
| `resetConfig()`              | Config only                               |
| `clearRouteTreeCache()`      | The memoized route tree                   |
| `resetTransfer()`            | Every transfer payload and the flash slot |
| `resetNavigationListeners()` | `subscribeNavigation` listeners           |
| `resetNavigationGuards()`    | `onBeforeNavigate` guards                 |

```ts
beforeEach(() => {
  resetSmartRouter();
  resetTransfer();
  resetNavigationListeners();
  resetNavigationGuards();
  initializeSmartRouter({ routes: ROUTES, force: true });
});
```

`force: true` is what makes re-initialization take effect after a reset.

### `createRouteState(routes, options)`

The derived state `createRouter` and the registry are both built on — ordering,
static list, meta and config, computed once. Useful if you want `matchRouteIn`
without the instance wrapper.

---

## React entry

### `useSmartRouter(): SmartRouter`

Fully memoized. Every method is stable for a given `(router, pathname)`.

```ts
nav.push(target, options)      nav.replace(target, options)
nav.back()                     nav.forward()      nav.refresh()
nav.prefetch(target, options)
nav.fsBack(options)            nav.pop(options)   nav.up(levels, options)
nav.sibling(name, options)     nav.child(name, options)   nav.root(options)
nav.canNavigate(target)        nav.pushIfExists(target, { fallback })
nav.resolve(target)            nav.setQuery(patch, options)
nav.pathname                   nav.router          // the raw Next router
```

```ts
interface NavigateOptions {
  scroll?: boolean;
  query?: QueryInput; // undefined values delete a key
  keepQuery?: boolean | readonly string[]; // sticky params; true by default
  state?: unknown; // read with useRouteState
  strategy?: TransferStrategy; // overrides the configured default
  flash?: FlashMessage; // read with useFlash
  shallow?: boolean; // History API, no server round-trip
}

interface PrefetchOptions {
  kind?: "auto" | "full";
}
```

`SmartRouter` is the returned object's type; `NextAppRouter` is the type of
`nav.router`, i.e. `ReturnType<typeof useRouter>`.

### Other hooks

| Hook                                                             | Returns                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `useRoute(options?)`                                             | `{ pathname, route, params, search, meta, breadcrumbs, isActive, nav }` |
| `useIsActive()`                                                  | `(target, options?) => boolean`                                         |
| `useBreadcrumbs(options?)`                                       | `Breadcrumb[]`                                                          |
| `useQueryState(key, parser, options?)`                           | `[value, setValue]`                                                     |
| `useQueryStates(parsers, options?)`                              | `[values, setValues]` — one navigation                                  |
| `useSearchParamsObject()`                                        | `Record<string, string>`                                                |
| `useRouteState<T>()`                                             | `T \| undefined`                                                        |
| `useRouteStateOr<T>(fallback)`                                   | `T`                                                                     |
| `useClearRouteState()`                                           | `() => void`                                                            |
| `useFlash()`                                                     | `FlashMessage \| undefined`, consumed once                              |
| `useRouteTree()` / `useChildren(route?)` / `useSiblings(route?)` | Tree nodes                                                              |
| `useNavigationGuard({ when, message, confirm })`                 | —                                                                       |
| `useSmartHistory()`                                              | Stack state and actions                                                 |
| `useLocationSearch()`                                            | Query string, SSR-correct — opts the page into the Suspense rule        |
| `useClientLocationSearch()`                                      | Query string, browser-only — imposes no Suspense requirement            |
| `useLocationHref(pathname)`                                      | `pathname` + live query                                                 |

Option types: `UseRouteOptions` (`{ breadcrumbs }`), `QueryStateOptions`
(extends `ParserOptions`), `RouteTreeOptions`
(`{ includeHidden, includePassthrough }`), `NavigationGuardOptions`
(`{ when, message, confirm }`), `UseSmartHistoryResult`, `UseRouteResult`.

### Escape hatches

`applyShallowUrl(url, "push" | "replace")` writes the URL through the History
API and notifies subscribed hooks. `notifyLocationChange()` fires that
notification alone, for when something else changed `window.location`. Both are
what `{ shallow: true }` is built on — reach for them only when you need the
mechanism without the hook.

### Components

`<SmartLink>` (`SmartLinkProps`) — all `<a>` props plus `href`,
`activeClassName`, `exact`,
`matchQuery`, `replace`, `scroll`, `prefetch` (`PrefetchStrategy` — `"render" | "hover" | "viewport" | false`),
`query`, `keepQuery`, `state`, `strategy`, `flash`.

`prefetch="hover"` (the default) waits ~80ms of hover before firing, so a
cursor crossing the nav doesn't prefetch the whole app. `"viewport"` uses an
`IntersectionObserver`.

`<SmartHistoryProvider initial maxLength history>` — scoped navigation stack.
Props type: `SmartHistoryProviderProps`.

`<SmartRouterDevtools position defaultOpen>` — development overlay.

---

## Types

Every exported type, grouped by what it belongs to. Option interfaces are also
shown inline at the function that takes them.

### Typed routes

| Type               | What it is                                               |
| ------------------ | -------------------------------------------------------- |
| `Register`         | The interface you augment to turn typed routes on        |
| `Route`            | Your route union once registered, otherwise `string`     |
| `RegisteredMeta`   | Your metadata shape once registered                      |
| `ParamsOf<R>`      | Params **read** from a pattern — `string` / `string[]`   |
| `BuildParamsOf<R>` | Params **accepted** when building — also allows `number` |
| `Simplify<T>`      | Flattens an intersection into one readable object type   |

```ts
ParamsOf<"/w/[id]/docs/[...slug]">; // { id: string; slug: string[] }
ParamsOf<"/files/[[...path]]">; //     { path?: string[] }
BuildParamsOf<"/w/[id]">; //           { id: string | number }
```

### Routes & matching

| Type                               | Notes                                                         |
| ---------------------------------- | ------------------------------------------------------------- |
| `RouteMatch`                       | `{ route, params, meta? }`                                    |
| `RouteParams`                      | `Record<string, ParamValue>`                                  |
| `ParamValue`                       | `string \| string[] \| undefined`                             |
| `RouteState`                       | `{ routes, ordered, staticRoutes, meta, config }`             |
| `RouteMeta` / `RouteMetaMap`       | Sidecar metadata, keyed by pattern                            |
| `RouteNode`                        | A node in the route tree                                      |
| `Breadcrumb` / `BreadcrumbOptions` | See [Breadcrumbs](#getbreadcrumbspathname-options-breadcrumb) |
| `SmartRouterInstance`              | What `createRouter` returns                                   |
| `RouteConflict`                    | What `validateRoutes` returns                                 |

### Configuration

| Type                           | Notes                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| `SmartRouterConfig`            | The fully resolved config                                          |
| `SmartRouterConfigInput`       | The partial you pass in; `transfer` is merged, not replaced        |
| `InitializeSmartRouterOptions` | `SmartRouterConfigInput` + `routes`, `meta`, `force`               |
| `CreateRouteStateOptions`      | `SmartRouterConfigInput` + `meta`                                  |
| `TransferConfig`               | `{ strategy, ttlMs, maxEntries, maxBytes, onOverflow, namespace }` |
| `TransferStrategy`             | `"memory" \| "session" \| "url-key" \| "query"`                    |
| `StickyMatcher`                | `string \| RegExp`                                                 |

### Function options

| Type                        | Taken by                                             |
| --------------------------- | ---------------------------------------------------- |
| `BuildHrefOptions`          | `buildHref` / `tryBuildHref`                         |
| `IsActiveOptions`           | `isActive`, `useIsActive`, `SmartLink`               |
| `FsBackOptions`             | `fsBackPathSafe`                                     |
| `NearestStaticRouteOptions` | `getNearestStaticRoute`                              |
| `GetParamsOptions`          | `getParams` — `{ coerce, assert, pathname, schema }` |
| `Coercers`                  | Its `coerce` map                                     |
| `ParamsFromKeys<K, R>`      | The untyped `getParams<["id"]>()` return             |
| `StandardSchemaLike<T>`     | Its `schema` — Zod 3.24+, Valibot, ArkType           |
| `NormalizeOptions`          | `normalizePath` — `{ basePath, locales }`            |

### URL & query

| Type           | Notes                                                  |
| -------------- | ------------------------------------------------------ |
| `UrlParts`     | `{ path, query, hash }` from `splitUrl`                |
| `QueryInput`   | What you pass to `withQuery` / `buildQuery`            |
| `QueryValue`   | One value: string, number, boolean, array, or nullish  |
| `ParsedQuery`  | `Record<string, string \| string[]>` from `parseQuery` |
| `QueryOptions` | `{ arrayFormat, sort }`                                |
| `ArrayFormat`  | `"repeat"` (default) or `"comma"`                      |

### Parsers

| Type                        | Notes                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `Parser<T, HasDefault>`     | `HasDefault` tracks `.default()` so chaining doesn't widen `T` back to `T \| null` |
| `ParserSpec<T>`             | `{ parse, serialize, eq? }` — the input to `createParser`                          |
| `ParserOptions`             | `{ history, shallow, throttleMs, scroll, clearOnDefault }`                         |
| `ParserMap`                 | `Record<string, Parser<any, any>>`                                                 |
| `InferParserMap<M>`         | The value object `useQueryStates` returns                                          |
| `SearchParamsDefinition<M>` | What `defineSearchParams` returns                                                  |
| `SortOrder`                 | `{ field, dir }` from `parseAsSortOrder`                                           |

### Transfer & events

| Type                     | Notes                                                               |
| ------------------------ | ------------------------------------------------------------------- |
| `FlashMessage`           | `{ type, message, ...extra }`                                       |
| `TransferEnvelope<T>`    | `{ v, t, data }` — the stored wrapper, versioned for migration      |
| `WriteTransferOptions`   | `{ strategy }`                                                      |
| `NavigationEvent`        | See above                                                           |
| `NavigationType`         | `"push" \| "replace" \| "back" \| "forward" \| "fsBack" \| "query"` |
| `NavigationListener`     | `(event: NavigationEvent) => void`                                  |
| `NavigationGuard`        | `(ctx: NavigationGuardContext) => void \| Promise<void>`            |
| `NavigationGuardContext` | `{ from, to, type, cancel }`                                        |
| `SmartHistoryOptions`    | `{ initial, maxLength }`                                            |

### Errors

`SmartRouterParamError` — thrown by `getParams` on a failed `assert` or
`schema`; carries `.issues`.
`SmartRouterHrefError` — thrown by `buildHref` on a missing or malformed param.
