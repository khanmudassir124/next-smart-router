---
"next-smart-router": major
---

Route precedence, query-param state, cross-screen transfer, and a route tree.

Twelve reproduced correctness bugs are fixed — most importantly, matching now
follows Next.js specificity (static > dynamic > catch-all > optional catch-all)
instead of insertion order, so a catch-all can no longer swallow its static
sibling.

New: `buildHref`, `isActive`, `<SmartLink>`, `useQueryState`/`useQueryStates`
with a parser set, sticky query params, `nav.push(href, { state })` with
`useRouteState`, flash messages, a route tree for filesystem-driven navigation,
`createRouter` for middleware and tests, typed routes via module augmentation,
navigation events and guards, and a devtools overlay.

Breaking: `matchRoute` returns `RouteMatch | null` rather than `boolean` (use
`routeExists` for the boolean); `smartHistory` is deprecated in favour of
`createSmartHistory` / `SmartHistoryProvider`.
