---
"next-smart-router": patch
---

Fixes to the React layer:

- **`basePath` apps:** `nav.fsBack()` and `nav.up()` navigated to
  `/app/app/...`, because they handed `router.push` a path that already had
  `basePath`. Shallow query writes (`useQueryState` with `shallow`, and
  `nav.setQuery`) dropped `basePath` from the address bar. Both fixed.
- **`useQueryState` / `useQueryStates`:**
  - A write still pending when the component unmounted was discarded. It now
    lands while the user is still on that page, and is dropped if they have
    navigated away.
  - Two setter calls in one tick now build on each other: `set(c => c + 1)`
    twice gives 2, and `set(5)` then `set(1)` ends on 1.
- **`<SmartLink>`:**
  - `target="_blank"` and `download` clicks are left to the browser, as
    `next/link` does. With a navigation guard registered, they used to
    navigate the current tab.
  - `matchQuery` now compares against the current search, so it can actually
    match.
  - Sticky params no longer go stale after a query change. This also removes
    a hydration mismatch.
- **`useNavigationGuard`:** with `interceptBrowserBack`, an inline `confirm`
  pushed a history entry on every render. It now installs once for each time
  `when` turns true.
