# FAQ

## Where exactly do I call `initializeSmartRouter`?

In a module that **both** Next module graphs import. Next builds the server and
the client separately, so module-level state initializes once per graph — a call
that only runs in a client provider leaves Server Components with an empty
registry.

The reliable pattern is a small setup module imported from the root layout; see
[Getting started](./getting-started.md#2-initialize).

If a matcher runs first, the registry holds only `"/"`. The library warns once
in development rather than returning plausible-but-wrong answers.

## Why do my Server Components see no routes?

Same reason — the registry was initialized in a client-only module. Either move
the call somewhere both graphs reach, or use `createRouter(ROUTES)`, which
carries its routes explicitly and has no initialization step at all. In Server
Components and middleware, `createRouter` is usually the better shape.

## Why does my build fail with "useSearchParams() should be wrapped in a suspense boundary"?

`useQueryState`, `useQueryStates` and `useRoute` read `useSearchParams()` so
their values are correct during SSR. That opts the page into Next's
client-rendering bailout, which fails a **static** prerender unless the tree is
wrapped in `<Suspense>`. This is Next's own rule for `useSearchParams`, not
something the library adds.

```tsx
<Suspense fallback={null}>
  <Filters />
</Suspense>
```

The transfer hooks — `useRouteState`, `useRouteStateOr`, `useClearRouteState`,
`useFlash` — deliberately do _not_ touch `useSearchParams()`, because they are
`undefined` on the server by contract and have nothing to gain from it.

## My manifest keeps going stale.

Use the plugin. `withSmartRouter` generates on `next build` and watches during
`next dev`, so there is nothing to remember. Add
`next-smart-router generate --check` to CI to catch it if someone bypasses it.

## Won't `--watch` fight with Next's own file watcher?

No. `generate` compares the serialized output to the file on disk and skips the
write when they match, so it cannot touch a file inside the project, trigger a
recompile and run again.

## Does `useRouteState` survive a refresh?

With the default `session` strategy, yes. It does **not** survive a new tab or a
shared link, and it never should be required — the destination screen must
render correctly without it. See [the transfer
contract](./concepts.md#the-transfer-contract).

## Why does `useRouteState` return `undefined` on the first render?

It reads through `useSyncExternalStore` with an explicit `undefined` server
snapshot. Reading `sessionStorage` during render would produce a hydration
mismatch — the server renders nothing, the client renders a value. The empty
first render is the correct behaviour, and it resolves immediately after
hydration.

## Can I intercept the browser back button?

Partly. `useNavigationGuard` fully covers `nav.push` / `replace` / `fsBack` and
`<SmartLink>` clicks. Hard navigation and tab close fall back to the browser's
`beforeunload` prompt, which ignores your message. The back button needs a
`history.pushState` sentinel, enabled with `interceptBrowserBack: true` — off by
default because it makes the history stack one entry deeper than the user
expects.

## Does this work with `basePath` / `trailingSlash` / i18n?

Yes. Pass them to `initializeSmartRouter` (or `createRouter`) and every entry
point strips them before matching. On output, the locale is always kept.
`basePath` and `trailingSlash` go on URL paths (`buildHref`, `fsBackPathSafe`)
but not on navigation hrefs (breadcrumbs, `nav.*`), because `<Link>` and
`router.push` add `basePath` themselves. See
[Normalization](./concepts.md#normalization).

```ts
initializeSmartRouter({ routes: ROUTES, basePath: "/app", locales: ["en", "fr"] });
```

## Do I have to use typed routes?

No. `Route` is `string` until you augment `Register`, so everything works
untyped. Registering the generated union is what turns a folder rename from a
silent `undefined` into a compile error.

## Is `smartHistory` safe to use?

It's deprecated. A module-level instance holds one user's navigation stack, and
on a Node server every concurrent request shares it. Use `createSmartHistory()`
or `<SmartHistoryProvider>` instead.

## How does this compare to…

**Next's built-in `typedRoutes`** — types `<Link href>` and `router.push`.
That's a subset of what the manifest enables here (params, breadcrumbs, trees,
`fsBack`, middleware metadata), and the two coexist fine.

**`nuqs`** — a focused, excellent query-state library. If query params are all
you need, it's the smaller dependency. The overlap here exists so query state
composes with sticky params, relative navigation and `SmartLink`.

**`next-safe-navigation` / `declarative-routing`** — schema-first: you declare
routes in code and derive types. This is filesystem-first: the `app/` directory
stays the source of truth and the manifest is generated from it. Pick based on
which one you want to be authoritative.

## Is the core entry safe on the edge?

Yes. `next-smart-router` imports neither `react` nor `next` — it's pure string
manipulation over a route list. `createRouter` in particular is designed for
`middleware.ts`.
