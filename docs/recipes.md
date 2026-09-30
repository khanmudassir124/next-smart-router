# Recipes

## A tab bar that writes itself

```tsx
"use client";
import { SmartLink, useChildren } from "next-smart-router/react";

export function WorkspaceTabs() {
  const tabs = useChildren("./");

  return (
    <nav>
      {tabs.map((tab) => (
        <SmartLink key={tab.path} href={`./${tab.segment}`} activeClassName="on">
          {tab.meta?.title ?? tab.segment}
        </SmartLink>
      ))}
    </nav>
  );
}
```

Add `app/w/[id]/billing/page.tsx` and the tab appears. Hide one with
`{ "hidden": true }` in its `route.meta.json`.

## A filter bar that doesn't hammer the server

```tsx
const [{ tab, page }, setFilters] = useQueryStates({
  tab: parseAsEnum(["overview", "members"]).default("overview"),
  page: parseAsInt.default(1).clearOnDefault(),
});

// Server reads these, so a real navigation is correct — but ONE of them.
setFilters({ tab: "members", page: 1 });

// Client-only, so skip the round-trip entirely.
const [q, setQ] = useQueryState("q", parseAsString.default(""), {
  shallow: true,
  throttleMs: 200,
});
```

Wrap the component in `<Suspense>` if its page is statically prerendered — the
same rule as calling `useSearchParams()` directly.

## Sharing one search-param definition

```ts
// app/w/[id]/search-params.ts
export const workspaceSearch = defineSearchParams({
  tab: parseAsEnum(["overview", "members"]).default("overview"),
  page: parseAsInt.default(1),
});
```

```tsx
// page.tsx (server) — Next 15 makes `searchParams` a Promise, so await it
const { tab, page } = workspaceSearch.parse(await searchParams);
// Next 14 and earlier: workspaceSearch.parse(searchParams)

// controls.tsx (client)
const [{ tab, page }, set] = useQueryStates(workspaceSearch);
```

Next forbids arbitrary named exports from `page.tsx`, so the definition needs
its own module anyway — which is where it belongs.

## Breadcrumbs with real names

```tsx
const workspace = useWorkspace(id);

const crumbs = getBreadcrumbs(pathname, {
  labels: { [`/w/${id}`]: workspace.name },
  format: "title",
  includeRoot: true,
});

return crumbs.map((crumb) =>
  crumb.isCurrent ? (
    <span key={crumb.href} aria-current="page">
      {crumb.label}
    </span>
  ) : (
    <SmartLink key={crumb.href} href={crumb.href}>
      {crumb.label}
    </SmartLink>
  )
);
```

`labelFor` gives full control, and `unmatched: "text"` keeps ancestors that
aren't routable as plain text instead of dropping them.

## Auth declared next to the page

```json
// app/w/[id]/settings/route.meta.json
{ "title": "Settings", "requiresAuth": true, "roles": ["owner", "admin"] }
```

```ts
// middleware.ts
import { createRouter } from "next-smart-router";
import { ROUTES, META } from "./route-manifest";

const router = createRouter(ROUTES, { meta: META });

export function middleware(request: NextRequest) {
  const match = router.match(request.nextUrl.pathname);
  if (!match?.meta?.requiresAuth) return NextResponse.next();

  const session = getSession(request);
  if (!session) {
    const next = encodeURIComponent(request.nextUrl.pathname);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }
  if (match.meta.roles && !match.meta.roles.includes(session.role)) {
    return NextResponse.rewrite(new URL("/403", request.url));
  }
}
```

Add a protected folder and it's protected. Delete it and the rule goes with it.

## Handing a cart to checkout

```tsx
// Screen A
nav.push("/checkout", {
  state: { cart },
  flash: { type: "success", message: "Cart saved" },
});

// Screen B — note the fallback is not optional
export function CheckoutSummary({ id }: { id: string }) {
  const state = useRouteState<{ cart: Cart }>();

  const { data: cart } = useQuery({
    queryKey: ["cart", id],
    queryFn: () => fetchCart(id),
    initialData: state?.cart,
  });

  return <Lines cart={cart} />;
}
```

## Flash after a Server Action redirect

The client never runs between the action and the redirect, so the message has
to ride in a cookie:

```ts
"use server";
export async function createWorkspace(form: FormData) {
  const workspace = await db.workspaces.create(/* … */);
  cookies().set(
    "nsr:flash",
    JSON.stringify({
      v: 1,
      t: Date.now(),
      data: { type: "success", message: "Workspace created" },
    })
  );
  redirect(`/w/${workspace.id}`);
}
```

Read it in a Server Component and hand it to `writeFlash` on the client, or
render the toast directly — `useFlash()` covers the client-navigation half.

## Blocking navigation on a dirty form

```tsx
useNavigationGuard({ when: form.formState.isDirty });

// or, with your own dialog
useNavigationGuard({
  when: form.formState.isDirty,
  confirm: () => showConfirmDialog("Discard changes?"),
});
```

Covers `nav.push` / `replace` / `fsBack` and `<SmartLink>` clicks fully; hard
navigation and tab close fall back to the browser's `beforeunload` prompt. The
back button needs `interceptBrowserBack: true`, which is off by default because
the sentinel technique it requires makes the history stack one entry deeper
than the user expects.

## Analytics grouped by pattern

```ts
subscribeNavigation((event) => {
  analytics.page(event.route, { ...event.params, ...event.search });
});
```

`event.route` is `/w/[id]/settings`, not `/w/8fa2…/settings` — ten thousand
workspaces produce one row, not ten thousand.

## A modal wizard with its own back stack

```tsx
<SmartHistoryProvider initial="/step-1">
  <Wizard />
</SmartHistoryProvider>;

function WizardNav() {
  const history = useSmartHistory();
  return (
    <button disabled={!history.canGoBack} onClick={history.back}>
      Back ({history.length})
    </button>
  );
}
```

Scoped to the subtree, so it can't be shared across requests the way a
module-level singleton would be.

## Only render a link if the route exists

```tsx
const nav = useSmartRouter();

{
  nav.canNavigate("../billing") && <SmartLink href="../billing">Billing</SmartLink>;
}
```

Or navigate defensively: `nav.pushIfExists("../billing", { fallback: "../" })`.
