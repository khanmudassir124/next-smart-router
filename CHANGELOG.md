# Changelog

## 1.2.0

### Minor Changes

- 191771b: Find routes no URL can reach, and explain how a URL resolved.

  `findUnreachableRoutes(routes)` reports patterns that a more specific sibling
  shadows at every depth they could serve. The page file exists, so nothing else
  catches this — not Next, and not a folder tree. Each result carries the witness
  URLs that were tried and what beat them, so it is a proof rather than an
  accusation. Validated at zero false positives across 18,000+ route sets that
  Next's own sorter accepts, checked against exhaustive search.

  `generate --check` now surfaces it as a warning, alongside a second one: whether
  Next itself would reject your route set, so a `next build` failure shows up in
  seconds instead of minutes. Neither warning changes the exit code.

  `explainIn(state, href)` answers why a URL resolved the way it did — the winner
  and its rank, everything that also matched and lost, and the reason each of the
  rest was rejected. `<SmartRouterDevtools>` now runs on it instead of computing
  near misses itself.

  `generate --check` also now catches **two folders that resolve to the same URL
  path** — `(marketing)/about` beside `(app)/about`, or `app/page.tsx` beside
  `app/(shop)/page.tsx`. Next refuses to build those, but the manifest deduped the
  pair before anything could look, so `--check` could never see it. The error names
  both folders. `collectRoutes` gains a `sources` map (route → the folders that
  produced it) to make this possible; that is an additive field.

  This is the one behaviour change that can newly fail a build that used to pass
  `--check`. Any app it fires on was already failing `next build`, so it moves the
  failure earlier rather than creating one.

  Also:

  - The devtools rank is labelled `nsr rank`. It is this library's specificity
    order, which differs from Next's trie ordering in position (never in which
    route wins), and the label stops it being read as a claim about the framework.
  - Unknown CLI flags are now an error. `--app-dr` used to silently fall through
    to the default app directory and report success.
  - Fixed the `searchParams` examples in the README and recipes: Next 15 makes it
    a Promise, so it needs `parse(await searchParams)`.

### Patch Changes

- dc76e64: Fixes to the React layer:

  - **`basePath` apps:** `nav.fsBack()` and `nav.up()` navigated to
    `/app/app/...`, because they handed `router.push` a path that already had
    `basePath`. Shallow query writes (`useQueryState` with `shallow`, and
    `nav.setQuery`) dropped `basePath` from the address bar. Both fixed.
  - **`useQueryState` / `useQueryStates`:**
    - A write still pending when the component unmounted was discarded. It now
      lands while the user is still on that page, and is dropped if they have
      navigated away.
    - Two setter calls in one tick now build on each other: `set(c => c + 1)`
      twice gives 2, and `set(5)` then `set(1)` ends on 1.
  - **`<SmartLink>`:**
    - `target="_blank"` and `download` clicks are left to the browser, as
      `next/link` does. With a navigation guard registered, they used to
      navigate the current tab.
    - `matchQuery` now compares against the current search, so it can actually
      match.
    - Sticky params no longer go stale after a query change. This also removes
      a hydration mismatch.
  - **`useNavigationGuard`:** with `interceptBrowserBack`, an inline `confirm`
    pushed a history entry on every render. It now installs once for each time
    `when` turns true.

- 358df58: Outputs now keep the user's locale, and treat `basePath` consistently:

  - **Locales:** `fsBackPathSafe`, `getNearestStaticRoute`, breadcrumb hrefs,
    `nav.fsBack()`, `nav.up()` and `nav.root()` stripped the locale prefix and
    never put it back. `/fr/w/42/members` went back to `/w/42`, out of the
    user's locale. They now keep it, as the FAQ always said. Breadcrumb `labels`
    can still be keyed by the bare href.
  - **`basePath` text in a route:** with basePath `/docs`, `buildHref("/docs/[slug]")`
    returned `/docs/intro` because it mistook the route for an already-prefixed
    path. It now returns `/docs/docs/intro`. `applyBasePath` itself stays
    idempotent, as documented.
  - **`trailingSlash`:** `fsBackPathSafe` and `getNearestStaticRoute` now apply
    `trailingSlash`, as `createRouter`'s versions already did.
  - **Which outputs carry `basePath`:** URL paths (`buildHref`, `fsBackPathSafe`,
    `getNearestStaticRoute`) include it. Navigation hrefs (breadcrumbs, `nav.*`)
    don't, because `<Link>` and `router.push` add it. That split was already the
    behaviour; it is now documented in Concepts → Normalization and pinned by
    tests. `createRouter` now shares one implementation of `fsBack`,
    `nearestStatic` and `breadcrumbs` with the global functions, so the two
    can't drift apart again.

- 6c29577: Sticky query params no longer drop repeated keys on the target. Carrying
  `locale` onto `../members?tag=a&tag=b` used to produce `?locale=fr&tag=b`;
  it now keeps both `tag` values. Fixed in `nav.push`, `<SmartLink>` and
  `createRouter().withSticky`, which now share one implementation.

  `generate --check` now fails on a folder holding both a page and a route
  handler (`settings/page.tsx` beside `settings/route.ts`). Next refuses to build
  that; the generator used to drop the route from the manifest without a word.
  `collectRoutes` gains an additive `clashes` field listing those folders.

- 5574865: Route matching is about 15× faster on large apps: 168 µs → 11 µs per match at
  500 routes. Middleware calls it on every request, and `fsBack` and breadcrumbs
  call it once per path segment. An exact static match is now a single lookup,
  and dynamic routes whose depth can't fit the path are skipped before they're
  walked. Results are unchanged, and a seeded test holds the new matcher to the
  old linear walk across 24,000 cases.
- 746f518: Core fixes:

  - `resolvePath(current, "#top")` keeps the current query, as a browser does. It
    used to drop it, so clicking an in-page anchor reset the filters.
  - `createRouter().isActive` now honours `matchQuery`. It had its own copy of
    the logic that ignored the option. Both versions also ignore a `#hash` when
    comparing queries now, and accept a pattern target that carries a query
    (`"/w/[id]?tab=a"`).
  - `defineSearchParams().href(path, values)` merges onto a query already in
    `path` and keeps its hash, instead of producing `/w?x=1?page=2`. It also
    works when destructured.

## 1.0.0

A rewrite of the internals around one change — the route registry now
pre-computes Next.js specificity ordering — plus three new capability areas:
query-param state, cross-screen data transfer, and a route tree.

See [docs/migration-1.0.md](./docs/migration-1.0.md) for the upgrade path.

### Fixed

Every item here was reproduced against 0.1.1 and now has a regression test.

- **Route precedence.** Matching walked the route set in insertion order, so a
  catch-all emitted before its static sibling swallowed it —
  `getParams("/docs/about")` returned `{ slug: ["about"] }`. Routes are now
  sorted static > dynamic > catch-all > optional catch-all at registration.
- **Empty optional catch-all** captured `[]` where Next.js gives `undefined`,
  which also made `assert` pass for a param that captured nothing.
- **Catch-all segments were never URI-decoded**, while single dynamic segments
  were — the same value decoded or not depending on which pattern matched.
- **`decodeURIComponent` threw on a malformed escape**, crashing the render tree
  for any URL like `/w/%E0%A4%A`. All decoding now degrades to the raw value.
- **`resolvePath` had no concept of a query string or hash.**
  `resolvePath("/a/b?q=1", "./x")` produced `"/a/b?q=1/x"`.
- **Matchers rejected any pathname carrying a query or hash**, and dynamic
  routes silently captured the query into the param.
- **Breadcrumb labels were raw, undecoded slugs.**
- **`resetSmartRouter` cleared the flag but left routes registered**, leaking
  state between tests.
- **CLI: any folder named `api` was dropped at any depth**, so a real page at
  `/settings/api` vanished. Route handlers are detected by `route.ts` now.
- **CLI: intercepting routes** (`(.)photo`) were emitted as literal path
  segments.
- **CLI: `pageExtensions` was ignored** and `page.mdx` was never found.
- **CLI: the manifest was rewritten unconditionally**, which would have become a
  rebuild loop under watch mode.
- **CLI: the binary did nothing when invoked by its own name on Linux/macOS.**
  npm's bin entry there is a symlink named `next-smart-router`, so a guard
  keyed on `process.argv[1]` ending in `bin.js` never matched and `generate`
  exited 0 having written nothing. (Windows was unaffected — its shim is a
  `.cmd` that calls `node …in.js`.) The binary now always runs, and the
  suite spawns it under both filenames.

### Added

**Navigation**

- `buildHref` / `tryBuildHref` — fill a route pattern with encoded params.
- `isActive` / `useIsActive` — pattern-aware, prefix-safe active state.
- `<SmartLink>` — relative hrefs in markup, active class, prefetch strategies
  (`hover` / `viewport` / `render`), sticky query, transfer state.
- `nav.up(n)`, `sibling`, `child`, `root`, `canNavigate`, `pushIfExists`,
  `resolve`, `setQuery`.
- `NavigateOptions` on every method — `scroll`, `query`, `keepQuery`, `state`,
  `flash`, `shallow`.
- `useRoute()` — pattern, params, search, meta, breadcrumbs and nav in one
  memoized object.

**Query state**

- `useQueryState`, `useQueryStates` (batched into one navigation),
  `useSearchParamsObject`.
- Parsers: `parseAsString`, `parseAsInt`, `parseAsFloat`, `parseAsBoolean`,
  `parseAsIsoDate`, `parseAsDateOnly`, `parseAsEnum`, `parseAsArrayOf`,
  `parseAsJson`, `parseAsSortOrder`, `createParser`; with `.default()`,
  `.clearOnDefault()`, `.withOptions()`, `.withEq()`.
- `defineSearchParams` — one definition read by the server page and the client.
- `shallow: true` writes via the History API, skipping the RSC round-trip.
- Sticky query params (`stickyQuery`) carried across every navigation, including
  through `<SmartLink>`.
- Pure helpers: `withQuery`, `setQuery`, `pickQuery`, `omitQuery`, `mergeQuery`,
  `selectQuery`, `parseQuery`, `buildQuery`, `splitUrl`, `normalizePath`.

**Cross-screen transfer**

- `nav.push(href, { state })` + `useRouteState` / `useRouteStateOr`, read
  through `useSyncExternalStore` with an explicit `undefined` server snapshot.
- Four strategies — `memory`, `session`, `url-key`, `query`.
- Flash messages: `writeFlash` / `useFlash`, consumed exactly once.
- Lifecycle: TTL, LRU eviction, byte caps, namespacing, and a dev warning that
  names values which won't survive serialization.

**Platform**

- `createRouter(routes, options)` — a pure instance with no globals, usable in
  `middleware.ts`, Server Components, tests and scripts.
- Route tree: `getRouteTree`, `getChildren`, `getSiblings`, `getParent`,
  `getDescendants`, and `useChildren` / `useSiblings` for filesystem-driven nav.
- Route metadata from `route.meta.json` sidecars, surfaced on matches and used
  for breadcrumb labels and middleware protection.
- Typed routes: `Register` module augmentation, `Route`, `ParamsOf`,
  `BuildParamsOf`; the CLI emits the union.
- `basePath`, `trailingSlash` and `locales` support throughout.
- Navigation events (`subscribeNavigation`) carrying the matched **pattern**, so
  analytics group by `/w/[id]` instead of by concrete URL.
- Navigation guards: `onBeforeNavigate`, `useNavigationGuard`.
- `<SmartRouterDevtools />` with a near-miss explainer for the specificity list.
- Standard Schema validation on `getParams({ schema })`.
- Dev warning when a matcher runs before `initializeSmartRouter`.

**Tooling**

- `withSmartRouter` Next.js plugin — generates on build, watches on dev, reads
  `pageExtensions` from the wrapped config.
- CLI `--watch`, `--check`, `--page-extensions`, `--ignore`, `--no-types`,
  `--no-meta`, `--silent`, `--version`.
- `validateRoutes` — catch-all-not-last, conflicting param names, duplicates.

### Changed

- **`matchRoute` returns `RouteMatch | null` instead of `boolean`.** Truthiness
  is unchanged; `routeExists` is the boolean form.
- `getBreadcrumbs` returns `segment`, `pattern`, `param`, `isCurrent` and
  `matched`, and accepts `labels`, `labelFor`, `format`, `includeRoot`,
  `unmatched`.
- `getNearestStaticRoute` takes `{ includeSelf }`; the default is unchanged.
- `useSmartRouter` is fully memoized — stable across renders, safe as an effect
  dependency and no longer defeats `React.memo`.
- `smartHistory` is deprecated in favour of `createSmartHistory` and
  `SmartHistoryProvider`; the class gained `replace`, `canGoBack`, `length`,
  `entries`, `subscribe` and a `maxLength` cap.
- `exports` now declares per-condition types, so `require()` consumers get
  `index.d.cts` instead of the ESM declarations.
- `bin` is declared as `dist/cli/bin.js`, not `./dist/cli/bin.js`. npm 11
  rejects the `./` prefix and strips the entry from the published manifest, so
  the tarball would have shipped with no executable at all — with a warning,
  not an error. A test now asserts it, since `publint` and
  `npm publish --dry-run` both pass either way.
- CI runs on pull requests across Node 18/20/22 × Next 13.5/14/15, with lint,
  coverage, `publint`, and a tarball-install smoke test against a real example
  app. Releases are driven by Changesets, so a breaking change can't ship as a
  patch.

## 0.1.1

- Initial release: relative navigation, route manifest CLI, params,
  breadcrumbs, filesystem-safe back.
