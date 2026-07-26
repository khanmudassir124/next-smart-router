# next-smart-router

[![npm version](https://img.shields.io/npm/v/next-smart-router.svg)](https://www.npmjs.com/package/next-smart-router)
[![npm downloads](https://img.shields.io/npm/dm/next-smart-router.svg)](https://www.npmjs.com/package/next-smart-router)
[![license](https://img.shields.io/npm/l/next-smart-router.svg)](./LICENSE)

Filesystem-style routing helpers for the **Next.js App Router**.

Think of your `app/` routes like a Unix filesystem: navigate with relative
paths (`../`, `./`), auto-generate a route manifest, extract typed dynamic
params, build breadcrumbs, and always fall back to a real (never-404) route.

- 🧭 **Relative navigation** — `router.push("../settings")`
- 🗺️ **Auto route manifest** — a CLI walks your `app/` directory
- 🏷️ **Typed params** — `getParams<["id"]>()` with coercion & assertion
- 🍞 **Breadcrumbs** — only real, matchable ancestors
- ⬆️ **Safe back** — `fsBack()` jumps to the nearest existing route
- 🔌 **Native escape hatch** — the raw `next/navigation` router is always exposed
- 🪶 **Zero runtime deps** — `next` and `react` are optional peers

## vs. Next's `useRouter`

`useSmartRouter` is a **thin superset** of `next/navigation`'s `useRouter`. It
keeps every native method and adds the pieces `useRouter` leaves to you. The
raw Next router is always on `.router`, so you lose nothing.

### Method-by-method

| | Next `useRouter()` | `useSmartRouter()` |
| --- | --- | --- |
| `push(href)` | absolute href only | **relative-aware** (`"../settings"`, `"./new"`) + absolute |
| `replace(href)` | absolute href only | **relative-aware** + absolute |
| `prefetch(href)` | absolute href only | **relative-aware** + absolute |
| `back()` | ✅ | ✅ (delegates) |
| `forward()` | ✅ | ✅ (delegates) |
| `refresh()` | ✅ | ✅ (delegates) |
| current pathname | separate `usePathname()` | `.pathname` included |
| the native router | — | `.router` (the exact `useRouter()` instance) |
| **`fsBack()` / `pop()`** | ❌ | up to the nearest *real* route — never 404 |

### Things `useRouter` doesn't do at all

`useRouter` is navigation-only. These have no equivalent in `next/navigation`
and are why the library exists:

| Need | With `next/navigation` | With next-smart-router |
| --- | --- | --- |
| **Move relative to where you are** | Rebuild the absolute path from `usePathname()` and normalize `..` by hand. | `nav.push("../settings")` |
| **A "back/up" button that never 404s** | `router.back()` can leave your app or land on a deleted route. | `nav.fsBack()` walks up to the nearest *real* route. |
| **Breadcrumbs** | Hand-write trail logic per layout; it drifts from real routes. | `getBreadcrumbs(pathname)` — only matchable ancestors. |
| **Read params away from a page** | `useParams` only works inside the route tree; middleware/logging/edge have just a raw string. | `getParams<["id"]>({ pathname })` anywhere, typed. |
| **Redirect somewhere "safe"** | Strip dynamic ids from the path by hand. | `getNearestStaticRoute(pathname)`. |
| **Know all your routes at runtime** | No built-in registry of route patterns. | A generated manifest + a lazily-read registry. |

### Side by side

```ts
// next/navigation — you assemble the target yourself
import { useRouter, usePathname } from "next/navigation";
const router = useRouter();
const pathname = usePathname();                        // /workspaces/42/overview
router.push(pathname.replace(/\/[^/]+$/, "/settings")); // /workspaces/42/settings

// next-smart-router — relative, plus the native router still on hand
import { useSmartRouter } from "next-smart-router/react";
const nav = useSmartRouter();
nav.push("../settings");
nav.router.refresh();                                   // native escape hatch
```

### When plain `useRouter` is enough

- You only ever navigate with absolute paths.
- You only need params inside a page/layout (Next's `useParams` covers it).
- You want routes checked at *compile* time → Next's experimental
  `typedRoutes`; this library validates at *runtime* instead.

## Limitations & known trade-offs

Be aware of these before adopting — details in
[FAQ](./docs/faq.md) and [Concepts](./docs/concepts.md):

- **The manifest is a build-time snapshot.** Add a route folder and you must
  regenerate (wire `predev`/`prebuild`). Nothing updates the registry at runtime
  on its own.
- **You must `initializeSmartRouter()` once.** Before that, registry-backed
  helpers (`getParams`, `getBreadcrumbs`, `fsBackPathSafe`,
  `getNearestStaticRoute`) only know about `/`.
- **`resolvePath` is pure string math** — `push("../x")` does *not* verify the
  target exists. Guard with `matchRoute(target)` if you need certainty.
- **Runtime, not compile-time, param typing.** `getParams<["id"]>()` trusts the
  keys you pass; it can't prove they exist in the route at build time.
- **First registered match wins.** If two patterns can match the same path
  (e.g. a static route and a `[slug]`), `getParams` returns the first one in
  registration order. The CLI sorts routes, which generally puts static before
  dynamic, but overlapping patterns are inherently ambiguous.
- **`fsBack` walks the *path*, not browser history** — it's deliberately not the
  same as pressing the browser back button (use `back()` for that).

## Install

```bash
npm install next-smart-router
```

## Documentation

Full guides live in [`docs/`](./docs/README.md):

- [Getting Started](./docs/getting-started.md)
- [Concepts](./docs/concepts.md) — the mental model, registry, matching rules
- [API Reference](./docs/api-reference.md)
- [CLI](./docs/cli.md)
- [Recipes](./docs/recipes.md)
- [FAQ & Troubleshooting](./docs/faq.md)

## 1. Generate a route manifest

Walk your Next.js `app/` directory and emit a manifest of route patterns:

```bash
npx next-smart-router generate --app-dir src/app --out src/route-manifest.ts
```

Produces:

```ts
/* AUTO-GENERATED by next-smart-router — DO NOT EDIT */
export const ROUTES = new Set([
  "/",
  "/workspaces",
  "/workspaces/[id]",
  "/docs/[...slug]",
]);
```

Add it to your build so it stays fresh:

```jsonc
// package.json
{
  "scripts": {
    "predev": "next-smart-router generate --app-dir src/app --out src/route-manifest.ts",
    "prebuild": "next-smart-router generate --app-dir src/app --out src/route-manifest.ts"
  }
}
```

> Route groups `(group)` are stripped, and `_private` / `api` / `@parallel`
> folders are ignored — matching Next.js semantics.

## 2. Initialize once

```ts
// e.g. in a root client provider or instrumentation file
import { initializeSmartRouter } from "next-smart-router";
import { ROUTES } from "@/route-manifest";

initializeSmartRouter({ routes: ROUTES });
```

## 3. Use it

### The client hook

```tsx
"use client";
import { useSmartRouter } from "next-smart-router/react";

export function Toolbar() {
  const nav = useSmartRouter();
  return (
    <>
      <button onClick={() => nav.push("../settings")}>Settings</button>
      <button onClick={() => nav.push("./new")}>New</button>
      <button onClick={() => nav.fsBack()}>Back</button>

      {/* native next/navigation router is always available */}
      <button onClick={() => nav.refresh()}>Refresh</button>
      <button onClick={() => nav.router.push("/dashboard", { scroll: false })}>
        Dashboard
      </button>
    </>
  );
}
```

Prefer the raw Next hooks? They're re-exported from the same entry:

```ts
import { useRouter, usePathname, useSearchParams, useParams } from "next-smart-router/react";
```

### Typed params

```ts
import { getParams } from "next-smart-router";

// route: /workspaces/[id]/docs/[...path]
const { id, path } = getParams<["id", "path"]>();
// id: string, path: string[]

// coerce + assert
const { id } = getParams<["id"], { id: number }>({
  coerce: { id: (v) => Number(v) },
  assert: ["id"],
});
```

On the server, pass `pathname` explicitly:

```ts
getParams<["id"]>({ pathname: "/workspaces/42" });
```

### Breadcrumbs

```ts
import { getBreadcrumbs } from "next-smart-router";

getBreadcrumbs("/workspaces/42/settings");
// [{ label: "workspaces", href: "/workspaces" },
//  { label: "42",         href: "/workspaces/42" },
//  { label: "settings",   href: "/workspaces/42/settings" }]
```

### Safe / static back

```ts
import { fsBackPathSafe, getNearestStaticRoute } from "next-smart-router";

fsBackPathSafe("/workspaces/42/settings");   // "/workspaces/42"
getNearestStaticRoute("/workspaces/42/edit"); // "/workspaces" (skips dynamic)
```

## API

| Export | Kind | Description |
| --- | --- | --- |
| `initializeSmartRouter({ routes, force? })` | fn | Register known routes (call once). |
| `setRoutes(routes)` / `getRoutes()` / `hasRoutes()` | fn | Low-level registry access. |
| `useSmartRouter()` | hook | `next-smart-router/react` — relative push/replace/prefetch, back/forward/refresh, fsBack/pop, plus the raw `.router`. |
| `useRouter` / `usePathname` / `useSearchParams` / `useParams` | hook | `next-smart-router/react` — native `next/navigation` hooks, re-exported. |
| `getParams<Keys, Coerce>(options?)` | fn | Extract typed dynamic params. |
| `getBreadcrumbs(pathname)` | fn | Breadcrumb trail of real ancestors. |
| `fsBackPathSafe(pathname)` | fn | Nearest existing ancestor route. |
| `getNearestStaticRoute(pathname)` | fn | Nearest non-dynamic ancestor route. |
| `resolvePath(current, target)` | fn | Resolve `../`, `./`, absolute paths. |
| `matchRoute(path, routes?)` / `matchRoutePattern(path, pattern)` | fn | Route matching (dynamic, catch-all, optional catch-all). |
| `smartHistory` | obj | Optional in-memory navigation stack. |

## CLI

```
next-smart-router generate [options]

  --app-dir <path>   Path to the "app" directory (default: ./app)
  --out, -o <path>   Output file; ".json" emits JSON, else a TS module
                     exporting "ROUTES" (default: ./route-manifest.ts)
  -h, --help         Show help
```

## Contributing & Publishing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup and project layout.

To cut a release:

```bash
npm login              # once; requires an npm account with 2FA
npm version patch      # bump (patch | minor | major) + git tag
npm publish            # runs the build via prepublishOnly, then publishes
```

The package publishes publicly (`publishConfig.access: "public"`). Remember to
update [CHANGELOG.md](./CHANGELOG.md).

## License

MIT © next-smart-router contributors
