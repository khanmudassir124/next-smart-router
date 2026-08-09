import { NextResponse, type NextRequest } from "next/server";
import { createRouter } from "next-smart-router";

import { ROUTES, META } from "./route-manifest";

// `createRouter` carries its routes explicitly, so it works on the edge with
// no initialization step and no module-level state.
const router = createRouter(ROUTES, { meta: META });

export function middleware(request: NextRequest) {
  const match = router.match(request.nextUrl.pathname);
  if (!match?.meta?.requiresAuth) return NextResponse.next();

  // Stand-in for a real session lookup. The rule lives next to the page it
  // protects (app/w/[id]/settings/route.meta.json), not in a matcher array
  // that drifts from the filesystem.
  const signedIn = request.cookies.has("session");
  if (signedIn) return NextResponse.next();

  const next = encodeURIComponent(request.nextUrl.pathname);
  return NextResponse.redirect(new URL(`/?next=${next}`, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
