---
"next-smart-router": patch
---

Route matching is about 15× faster on large apps: 168 µs → 11 µs per match at
500 routes. Middleware calls it on every request, and `fsBack` and breadcrumbs
call it once per path segment. An exact static match is now a single lookup,
and dynamic routes whose depth can't fit the path are skipped before they're
walked. Results are unchanged, and a seeded test holds the new matcher to the
old linear walk across 24,000 cases.
