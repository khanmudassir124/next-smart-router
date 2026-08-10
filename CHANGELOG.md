# Changelog

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
