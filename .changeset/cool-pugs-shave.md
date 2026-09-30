---
"next-smart-router": minor
---

Find routes no URL can reach, and explain how a URL resolved.

`findUnreachableRoutes(routes)` reports patterns that a more specific sibling
shadows at every depth they could serve. The page file exists, so nothing else
catches this — not Next, and not a folder tree. Each result carries the witness
URLs that were tried and what beat them, so it is a proof rather than an
accusation. Validated at zero false positives across 18,000+ route sets that
Next's own sorter accepts, checked against exhaustive search.

`generate --check` now surfaces it as a warning, alongside a second one: whether
Next itself would reject your route set, so a `next build` failure shows up in
seconds instead of minutes. Neither warning changes the exit code.

`explainIn(state, href)` answers why a URL resolved the way it did — the winner
and its rank, everything that also matched and lost, and the reason each of the
rest was rejected. `<SmartRouterDevtools>` now runs on it instead of computing
near misses itself.

`generate --check` also now catches **two folders that resolve to the same URL
path** — `(marketing)/about` beside `(app)/about`, or `app/page.tsx` beside
`app/(shop)/page.tsx`. Next refuses to build those, but the manifest deduped the
pair before anything could look, so `--check` could never see it. The error names
both folders. `collectRoutes` gains a `sources` map (route → the folders that
produced it) to make this possible; that is an additive field.

This is the one behaviour change that can newly fail a build that used to pass
`--check`. Any app it fires on was already failing `next build`, so it moves the
failure earlier rather than creating one.

Also:

- The devtools rank is labelled `nsr rank`. It is this library's specificity
  order, which differs from Next's trie ordering in position (never in which
  route wins), and the label stops it being read as a claim about the framework.
- Unknown CLI flags are now an error. `--app-dr` used to silently fall through
  to the default app directory and report success.
- Fixed the `searchParams` examples in the README and recipes: Next 15 makes it
  a Promise, so it needs `parse(await searchParams)`.
