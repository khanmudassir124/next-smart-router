# Contributing

Thanks for your interest in improving next-smart-router!

## Development setup

```bash
npm install
```

## Common tasks

| Command | What it does |
| --- | --- |
| `npm run build` | Build ESM + CJS + types, then re-add `"use client"`. |
| `npm run dev` | Rebuild on change (`tsup --watch`). |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Watch mode. |
| `npm run typecheck` | `tsc --noEmit`. |

## Project layout

```
src/
├── index.ts            # core public API (server-safe)
├── react.ts            # client entry ("use client")
├── core/               # framework-agnostic logic
│   ├── route-registry.ts
│   ├── route-matcher.ts
│   ├── segments.ts
│   ├── resolve-path.ts
│   ├── get-params.ts
│   ├── breadcrumbs.ts
│   ├── fs-back.ts
│   ├── get-nearest-static-route.ts
│   ├── initialize-smart-router.ts
│   └── history.ts
├── react/
│   └── use-smart-router.ts
└── cli/
    ├── generate-routes.ts  # reusable generator
    └── bin.ts              # #!/usr/bin/env node entry
scripts/
└── add-use-client.mjs      # post-build directive fix
```

## Guidelines

- **Keep the core framework-agnostic.** Nothing under `src/core` may import
  `react` or `next` — those belong in `src/react`.
- **Read the registry lazily.** Call `getRoutes()` inside functions, never at
  module scope, so late/`force` registration is always visible.
- **Add a test** for any behavior change (`test/smart-router.test.ts`).
- **Update the docs** in `docs/` and the `CHANGELOG.md`.

## The `"use client"` directive

tsup/esbuild strip module-level directives while bundling, so the client entry
gets `"use client"` re-added by `scripts/add-use-client.mjs` after the build.
If you add another client entry, update that script's `targets` list.

## Releasing

1. Bump the version in `package.json`.
2. Update `CHANGELOG.md`.
3. `npm run build && npm test`.
4. `npm publish` (runs `prepublishOnly` → `build`).
