# next-smart-router playground

A real Next.js app wired to the local package, exercising every feature. CI
installs the packed tarball here and runs `next build`, which is what proves the
exports map, the `"use client"` directive and the plugin actually work outside
this repo.

```bash
npm install
npm run dev
```

## What each part demonstrates

| Where                          | Feature                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| `next.config.mjs`              | `withSmartRouter` — the manifest generates itself on dev and build    |
| `smart-router.d.ts`            | Typed routes: `Route` union registered, params inferred from patterns |
| `middleware.ts`                | `createRouter` on the edge, auth declared in `route.meta.json`        |
| `app/w/[id]/layout.tsx`        | `useChildren("./")` — tabs generated from the filesystem              |
| `app/w/[id]/page.tsx`          | `defineSearchParams` parsed on the **server**                         |
| `app/w/[id]/controls.tsx`      | The same definition via `useQueryStates` on the **client**            |
| `app/w/[id]/controls.tsx`      | `shallow: true` filtering — URL updates with no RSC round-trip        |
| `app/w/[id]/settings/form.tsx` | `useNavigationGuard` on a dirty form                                  |
| `app/checkout/summary.tsx`     | `useRouteState` **and** its cold-entry fallback path                  |
| `components/breadcrumbs.tsx`   | `useBreadcrumbs` with `isCurrent` and title casing                    |
| `components/flash-toaster.tsx` | `useFlash`, consumed exactly once                                     |

## Things worth trying by hand

1. Click **Set a sticky locale**, then navigate anywhere — `?locale=fr` follows
   you, but `?page=` does not.
2. Type in the filter box and watch the URL change with no network request.
3. Hand a cart to `/checkout`, then **refresh** — the payload survives. Open the
   same URL in a new tab — it doesn't, and the page still renders.
4. Add `app/w/[id]/billing/page.tsx` while `npm run dev` is running. The tab
   appears without touching any menu code.
5. Type in the settings form, then try to leave.
