# FAQ & Troubleshooting

## `getParams()` returns `{}`

The pathname didn't match any registered route. Check:

1. Did you call `initializeSmartRouter({ routes })` before `getParams`?
2. Is the manifest current? Regenerate with the CLI.
3. Does the route pattern actually exist (e.g. `/workspaces/[id]`, not
   `/workspace/[id]`)?

Verify what's registered:

```ts
import { getRoutes } from "next-smart-router";
console.log([...getRoutes()]);
```

## `Error: pathname is required in non-browser environments`

`getParams()` reads `window.location.pathname` on the client. On the server
(RSC, middleware, tests) there's no `window`, so pass it explicitly:

```ts
getParams<["id"]>({ pathname: "/workspaces/42" });
```

## `useSmartRouter` throws about `useRouter`/hooks

The hook uses `next/navigation`, which requires:

- A **Client Component** (`"use client"` at the top of your file).
- Running inside the Next.js App Router.

The published `next-smart-router/react` entry already carries the `"use client"`
directive, so importing it from a Server Component and rendering it there will
fail — call it from your own client component.

## Nothing matches after adding a new route

The manifest is a build-time snapshot. Adding a folder under `app/` does **not**
update it automatically. Regenerate (or wire `predev`/`prebuild` — see
[CLI](./cli.md#keep-it-in-sync)).

## Do I have to use the CLI?

No. The registry accepts any iterable of patterns:

```ts
import { setRoutes } from "next-smart-router";
setRoutes(["/", "/about", "/blog/[slug]"]);
```

The CLI is just a convenient, convention-accurate way to produce that list.

## `initializeSmartRouter` seems to run twice / not re-run

It's idempotent by design — the second call is a no-op. For HMR or tests where
you *want* it to re-run, pass `{ force: true }`, or call `resetSmartRouter()`
first.

## Relative navigation doesn't hit the registry

Correct — `resolvePath` (used by `push`/`replace`) is pure path math and does
**not** validate against the registry. If you want to guarantee the target
exists, check it yourself:

```ts
import { matchRoute, resolvePath } from "next-smart-router";

const target = resolvePath(pathname, "../settings");
if (matchRoute(target)) router.push(target);
```

## Catch-all edge cases

- `[...slug]` requires **at least one** segment — `/docs` does *not* match
  `/docs/[...slug]`.
- `[[...slug]]` matches **zero or more** — `/files` *does* match
  `/files/[[...path]]`.

## ESM / CJS

The package ships both. `import` resolves to ESM, `require` to CJS, and types
are provided for each. No configuration needed.

## Does it work outside Next.js?

The core entry (`next-smart-router`) has no Next/React imports and works
anywhere — Remix, plain React, Node scripts, tests. Only
`next-smart-router/react` (`useSmartRouter`) is Next-specific.
