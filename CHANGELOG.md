# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

### Added

- Core helpers (`next-smart-router`):
  - `initializeSmartRouter`, `resetSmartRouter`, `isSmartRouterInitialized`
  - Route registry: `setRoutes`, `getRoutes`, `hasRoutes`
  - `getParams` with typed keys, coercion, and assertions
  - `getBreadcrumbs`, `fsBackPathSafe`, `getNearestStaticRoute`
  - `resolvePath`, `matchRoute`, `matchRoutePattern`
  - Segment utilities and the `smartHistory` in-memory stack
- Client hook (`next-smart-router/react`): `useSmartRouter` with relative,
  filesystem-style navigation. Exposes the raw `next/navigation` router as
  `.router`, plus relative-aware `prefetch` and native `forward`/`refresh`.
- `next-smart-router/react` also re-exports the native `next/navigation` hooks
  (`useRouter`, `usePathname`, `useSearchParams`, `useParams`).
- CLI (`next-smart-router generate`) and programmatic `next-smart-router/cli`
  (`generateRoutes`, `collectRoutes`) that walk a Next.js `app/` directory,
  honoring route groups, private/api/parallel folders, and all dynamic
  segment kinds.
- Dual ESM/CJS output with type declarations; `"use client"` preserved on the
  React entry.
- Vitest test suite and full documentation under `docs/`.
