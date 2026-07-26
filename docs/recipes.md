# Recipes

Practical patterns built on the [API](./api-reference.md).

## Breadcrumbs component

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBreadcrumbs } from "next-smart-router";

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <nav aria-label="Breadcrumb">
      <ol style={{ display: "flex", gap: 8 }}>
        <li><Link href="/">Home</Link></li>
        {crumbs.map((c, i) => (
          <li key={c.href}>
            <span aria-hidden> / </span>
            {i === crumbs.length - 1 ? (
              <span aria-current="page">{c.label}</span>
            ) : (
              <Link href={c.href}>{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

## Relative tabs within a section

```tsx
"use client";
import { useSmartRouter } from "next-smart-router/react";

const TABS = ["overview", "members", "settings"];

export function WorkspaceTabs() {
  const router = useSmartRouter();
  // from /workspaces/42/settings -> push("../overview") = /workspaces/42/overview
  return (
    <div>
      {TABS.map((tab) => (
        <button key={tab} onClick={() => router.push(`../${tab}`)}>
          {tab}
        </button>
      ))}
    </div>
  );
}
```

## A "back" button that never 404s

```tsx
"use client";
import { useSmartRouter } from "next-smart-router/react";

export function UpButton() {
  const router = useSmartRouter();
  // From a deep dynamic page, jumps to the nearest real ancestor route.
  return <button onClick={() => router.fsBack()}>← Back</button>;
}
```

## Typed params with coercion & assertion

```ts
import { getParams } from "next-smart-router";

// route: /workspaces/[id]/invoices/[invoiceId]
export function useInvoiceParams() {
  return getParams<["id", "invoiceId"], { id: number; invoiceId: number }>({
    coerce: { id: Number, invoiceId: Number },
    assert: ["id", "invoiceId"],
  });
}
// -> { id: number, invoiceId: number }
```

## Server-side params

On the server there's no `window`, so pass `pathname` explicitly:

```ts
// app/workspaces/[id]/page.tsx  (Server Component)
import { getParams } from "next-smart-router";

export default function Page({ params }: { params: { id: string } }) {
  // Prefer Next's own `params` in Server Components; getParams shines when you
  // only have a raw pathname (middleware, edge, logging, etc.):
  const parsed = getParams<["id"]>({ pathname: `/workspaces/${params.id}` });
  return <div>{parsed.id}</div>;
}
```

## Cross-domain redirect to a safe static route

```ts
import { getNearestStaticRoute } from "next-smart-router";

function switchWorkspaceDomain(targetHost: string) {
  // Drop any dynamic ids from the current path — they won't be valid elsewhere.
  const safePath = getNearestStaticRoute(window.location.pathname);
  window.location.href = `https://${targetHost}${safePath}`;
}
```

## Modal flow with an in-memory stack

```ts
import { smartHistory } from "next-smart-router";

smartHistory.init("/checkout");
smartHistory.push("/checkout/shipping");
smartHistory.push("/checkout/payment");

smartHistory.back();     // "/checkout/shipping"
smartHistory.current();  // "/checkout/shipping"
```

## Mixing smart and native navigation

The raw `next/navigation` router is always on `.router`, so you can mix relative
smart navigation with native options and methods in one place:

```tsx
"use client";
import { useSmartRouter } from "next-smart-router/react";

export function SaveBar() {
  const nav = useSmartRouter();

  const save = async () => {
    await saveDraft();
    nav.router.refresh();            // re-fetch server components
    nav.push("../preview");          // then move relatively
  };

  return (
    <div>
      <button onClick={save}>Save</button>
      {/* native options like scroll are available via .router */}
      <button onClick={() => nav.router.push("/", { scroll: false })}>Home</button>
    </div>
  );
}
```

Or import the native hooks directly from the same entry:

```ts
import { useRouter, useSearchParams } from "next-smart-router/react";
```

## Testing

Because the registry is read lazily, tests can (re)initialize freely:

```ts
import { beforeEach, expect, it } from "vitest";
import { initializeSmartRouter, getParams } from "next-smart-router";

beforeEach(() => {
  initializeSmartRouter({
    routes: new Set(["/", "/workspaces/[id]"]),
    force: true, // re-init between tests
  });
});

it("extracts id", () => {
  expect(getParams<["id"]>({ pathname: "/workspaces/42" }).id).toBe("42");
});
```
