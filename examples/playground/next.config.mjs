import { withSmartRouter } from "next-smart-router/plugin";

// The plugin generates route-manifest.ts on `next build` and keeps it fresh
// during `next dev`, reading pageExtensions and basePath from this config.
export default withSmartRouter(
  {
    reactStrictMode: true,
  },
  {
    out: "route-manifest.ts",
  }
);
