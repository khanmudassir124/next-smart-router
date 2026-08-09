# Contributing

Thanks for your interest in improving next-smart-router!

## Development setup

```bash
npm install
```

## Common tasks

| Command                 | What it does                                           |
| ----------------------- | ------------------------------------------------------ |
| `npm run build`         | Build ESM + CJS + types, then re-add `"use client"`.   |
| `npm run dev`           | Rebuild on change (`tsup --watch`).                    |
| `npm test`              | Run the Vitest suite once.                             |
| `npm run test:watch`    | Watch mode.                                            |
| `npm run test:coverage` | Suite with coverage thresholds.                        |
| `npm run typecheck`     | `tsc --noEmit`.                                        |
| `npm run lint`          | ESLint, zero warnings allowed.                         |
| `npm run format`        | Prettier write. `format:check` in CI.                  |
| `npm run lint:package`  | `publint` — catches broken `exports` / types mappings. |

## Project layout

```
src/
├── index.ts                    # core public API (server-safe, no react/next)
├── react.ts                    # client entry ("use client")
├── plugin.ts                   # withSmartRouter for next.config
├── globals.d.ts                # __NSR_VERSION__, replaced by tsup define
├── core/                       # framework-agnostic logic
│   ├── config.ts               # runtime config (basePath, sticky, transfer…)
│   ├── route-state.ts          # derived state: ordering, static list, meta
│   ├── route-registry.ts       # the default (global) state
│   ├── create-router.ts        # pure instance + validateRoutes
│   ├── route-matcher.ts        # matching + param capture
│   ├── route-tree.ts           # tree, children, siblings
│   ├── segments.ts             # classification, specificity, safeDecode
│   ├── url.ts                  # split/build/merge query, normalize, basePath
│   ├── parsers.ts              # parseAs* + defineSearchParams
│   ├── resolve-path.ts         # relative resolution (query/hash aware)
│   ├── build-href.ts           # pattern + params → encoded href
│   ├── is-active.ts
│   ├── get-params.ts
│   ├── breadcrumbs.ts
│   ├── fs-back.ts
│   ├── get-nearest-static-route.ts
│   ├── transfer.ts             # cross-screen payloads + flash
│   ├── events.ts               # navigation events + guards
│   ├── history.ts              # SmartHistory
│   ├── dev-warn.ts             # dev-only diagnostics
│   ├── typed-routes.ts         # Register / Route / ParamsOf
│   └── initialize-smart-router.ts
├── react/
│   ├── use-location.ts         # shallow-aware location subscription
│   ├── use-smart-router.ts     ├── use-route.ts
│   ├── use-query-state.ts      ├── use-route-state.ts
│   ├── use-route-tree.ts       ├── use-navigation-guard.ts
│   ├── smart-link.tsx          ├── history-provider.tsx
│   └── devtools.tsx
└── cli/
    ├── generate-routes.ts      # reusable generator
    ├── watch.ts                # debounced watcher
    └── bin.ts                  # #!/usr/bin/env node entry
scripts/
└── add-use-client.mjs          # post-build directive fix
test/
├── core.test.ts    url.test.ts    router.test.ts    cli.test.ts
├── transfer.test.ts
└── react/hooks.test.tsx         # happy-dom, next/navigation mocked
examples/playground/             # real Next app; CI installs the tarball into it
```

## Guidelines

- **Keep the core framework-agnostic.** Nothing under `src/core` may import
  `react` or `next` — those belong in `src/react`.
- **Read the registry lazily.** Call `getRouteState()` inside functions, never
  at module scope, so late/`force` registration is always visible.
- **Prefer pure functions taking state.** Anything a consumer might need in
  middleware should have a `…In(state, …)` form that `createRouter` can bind.
- **Never throw from a parser or a decoder.** A hand-edited URL must degrade,
  not white-screen the app. See `safeDecode` and `createParser`.
- **Snapshots read by `useSyncExternalStore` must be referentially stable.**
  Returning a freshly-parsed object each call is an infinite render loop; see
  the memo in `core/transfer.ts`.
- **Add a test for any behaviour change.** Bug fixes get a regression test named
  after the behaviour, not the internals.
- **Update `docs/` and `CHANGELOG.md`**, and add a changeset (below).

## The `"use client"` directive

tsup/esbuild strip module-level directives while bundling, so the client entry
gets `"use client"` re-added by `scripts/add-use-client.mjs` after the build.
If you add another client entry, update that script's `targets` list.

## Releasing

Releases are driven by [Changesets](https://github.com/changesets/changesets),
so the version bump follows the change rather than always being a patch.

```bash
npx changeset          # pick patch / minor / major, write a one-line summary
```

Commit the generated file with your PR. On merge to `main`, CI opens a
"Version Packages" PR; merging that publishes to npm with provenance.
