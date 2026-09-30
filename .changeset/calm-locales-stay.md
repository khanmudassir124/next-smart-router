---
"next-smart-router": patch
---

Outputs now keep the user's locale, and treat `basePath` consistently:

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
