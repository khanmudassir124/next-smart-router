---
"next-smart-router": patch
---

Sticky query params no longer drop repeated keys on the target. Carrying
`locale` onto `../members?tag=a&tag=b` used to produce `?locale=fr&tag=b`;
it now keeps both `tag` values. Fixed in `nav.push`, `<SmartLink>` and
`createRouter().withSticky`, which now share one implementation.

`generate --check` now fails on a folder holding both a page and a route
handler (`settings/page.tsx` beside `settings/route.ts`). Next refuses to build
that; the generator used to drop the route from the manifest without a word.
`collectRoutes` gains an additive `clashes` field listing those folders.
