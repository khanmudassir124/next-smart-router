# Concepts

## The manifest is the whole idea

Your `app/` directory already describes every route in the application. The
generator turns that into a list of _patterns_:

```
app/w/[id]/settings/page.tsx   →   "/w/[id]/settings"
```

Everything else in the library is a question asked of that list. "Does this path
exist?" is `matchRoute`. "What's the nearest real ancestor?" is `fsBackPathSafe`.
"What are this route's siblings?" is `getSiblings`. Without the manifest, none
of those have an answer at runtime — which is why a stale manifest is the one
failure mode worth engineering against (hence the plugin, `--watch`, `--check`,
and the dev warning).

## Specificity

Next.js resolves overlapping routes in a fixed order, segment by segment:

```
static  >  dynamic [id]  >  catch-all [...slug]  >  optional catch-all [[...slug]]
```

The registry sorts once at registration and every matcher reads that order, so
`/docs/about` resolves to `/docs/about` even when `/docs/[...slug]` is also
registered. Getting this wrong is subtle: the catch-all matches, so nothing
errors — you just get the wrong params.

`getOrderedRoutes()` exposes the order; the devtools panel shows a route's `nsr rank`
and which patterns also matched but lost.

## Normalization

Every entry point reduces its input to a bare, comparable pathname before
matching: query and hash removed, `basePath` and locale prefix stripped, slashes
collapsed, no trailing slash. That's why `matchRoute("/w/42?tab=1")` works, and
why `basePath: "/app"` needs no special handling at call sites.

Output paths get `basePath` and `trailingSlash` re-applied.

## The registry vs. `createRouter`

There are two ways to hold routes.

**The global registry** (`initializeSmartRouter`) is the convenient one. It's
module-level state, which means it is per _bundle_ — Next builds the server and
the client separately, so it initializes once per graph.

**`createRouter(routes, options)`** is a pure instance. It carries its routes
and config explicitly, so it works where a global can't:

```ts
const router = createRouter(ROUTES, { basePath: "/app", meta: META });

router.match("/app/w/42"); // → { route, params, meta }
router.build("/w/[id]", { id: 42 });
router.breadcrumbs("/app/w/42/settings");
```

Reach for it in `middleware.ts` (edge runtime, no initialization step), in
tests that need two route sets in one process, and in Server Components where
you'd rather be explicit than rely on module evaluation order.

## Relative paths

`resolvePath` works like a Unix filesystem path, and understands query strings
and hashes on both sides:

```
resolvePath("/a/b/c", "../x")      →  "/a/b/x"
resolvePath("/a/b/c", "./x")       →  "/a/b/c/x"
resolvePath("/a/b?q=1", "./x")     →  "/a/b/x"     (leaving the page drops its query)
resolvePath("/a/b/c", "../x?q=1")  →  "/a/b/x?q=1" (the target's own query comes along)
resolvePath("/a/b", "?q=1")        →  "/a/b?q=1"   (query-only target keeps the path)
```

Walking above the root clamps at `/`.

## `fsBack` vs. browser back

Browser back returns wherever the user came from — possibly another site, or a
page they've since deleted a record on. `fsBack` walks _up the path_ to the
nearest route that exists in the manifest:

```
/w/42/settings  →  /w/42  →  /w  →  /
```

If `/w/42` doesn't correspond to a route, it's skipped. The root always exists,
so there is always an answer, and it is never a 404.

## Sticky query params

Query params fall into two groups, and treating them the same is why they leak.

- **Screen-local** — `page`, `sort`, `q`. They describe the current view and
  should die on navigation.
- **Session-scoped** — `locale`, `ref`, `debug`, `utm_*`, an impersonation
  token. They describe the session and must survive every link.

`stickyQuery` declares the second group once. Both `nav.push` and `<SmartLink>`
honour it, which matters: a policy that only works in code leaks the first time
someone adds a link in a hurry.

## Shallow updates

`router.replace()` re-renders the Server Component tree. For a search box, that
is a full RSC round-trip per keystroke.

`{ shallow: true }` updates the URL through the History API instead — the
address bar changes, subscribed hooks re-render, and the server tree is
untouched. It is only correct when nothing on the server reads the param, which
is why the default is `false`.

## The transfer contract

`nav.push(href, { state })` hands data to the next screen. `useRouteState()`
reads it. The rule that keeps this from becoming a bug factory:

> Transfer state is never authoritative.

It returns `undefined` during the server render and on every cold entry — a
direct link, a refresh, a shared URL, a back navigation after a hard reload.
The API returns `T | undefined` and is never non-nullable, because the
destination screen must work without it. Treat it as a hydration hint:

```ts
const state = useRouteState<{ order: Order }>();

const { data } = useQuery({
  queryKey: ["order", id],
  queryFn: () => fetchOrder(id),
  initialData: state?.order, // skips the spinner, nothing more
});
```

The reads go through `useSyncExternalStore` with an explicit `undefined` server
snapshot, so the first client render matches the server's — reading storage
during render would be a hydration mismatch.

### Choosing a strategy

| Strategy              | Survives refresh | Back / forward    | Shared link | Clean URL       | Size      |
| --------------------- | ---------------- | ----------------- | ----------- | --------------- | --------- |
| `memory`              | ✗                | ✗                 | ✗           | ✓               | unbounded |
| `session` _(default)_ | ✓                | ✓ last-write-wins | ✗           | ✓               | ~5 MB     |
| `url-key`             | ✓                | ✓ exact per entry | ✗           | adds `?_nsr=`   | ~5 MB     |
| `query`               | ✓                | ✓                 | ✓           | encodes payload | ~2 KB     |

`session` keys by destination pathname: invisible and correct, except when two
different screens hand off to the same path and the user goes back — then the
older payload is gone. `url-key` writes a short nonce into the URL so every
history entry keeps its own payload. Start with `session`; upgrade per call
when back/forward correctness matters.
