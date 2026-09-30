---
"next-smart-router": patch
---

Core fixes:

- `resolvePath(current, "#top")` keeps the current query, as a browser does. It
  used to drop it, so clicking an in-page anchor reset the filters.
- `createRouter().isActive` now honours `matchQuery`. It had its own copy of
  the logic that ignored the option. Both versions also ignore a `#hash` when
  comparing queries now, and accept a pattern target that carries a query
  (`"/w/[id]?tab=a"`).
- `defineSearchParams().href(path, values)` merges onto a query already in
  `path` and keeps its hash, instead of producing `/w?x=1?page=2`. It also
  works when destructured.
