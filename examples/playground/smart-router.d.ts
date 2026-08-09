import type { Route as AppRoute } from "./route-manifest";

// Registering the generated union turns every `route` argument in the package
// into a checked literal, and makes params infer from the pattern:
//
//   buildHref("/w/[id]", { id: 42 })   ✓
//   buildHref("/w/[typo]", { id: 42 }) ✗ not assignable to Route
//   getParams("/w/[id]").id            ^? string
declare module "next-smart-router" {
  interface Register {
    route: AppRoute;
  }
}
