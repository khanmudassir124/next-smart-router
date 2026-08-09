"use client";

import { initializeSmartRouter } from "next-smart-router";
import { ROUTES } from "@/route-manifest";

// Runs at module evaluation on both the server and the client, which is what
// covers Next's two separate module graphs. Rendering nothing keeps it out of
// the tree's way.
initializeSmartRouter({
  routes: ROUTES,
  stickyQuery: ["locale", /^utm_/],
  force: true,
});

export function SmartRouterSetup() {
  return null;
}
