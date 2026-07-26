import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react.ts",
    "cli/generate-routes": "src/cli/generate-routes.ts",
    "cli/bin": "src/cli/bin.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // No source maps in the published package — keeps the tarball small and
  // avoids devtools 404s for consumers. Flip to true when debugging locally.
  sourcemap: false,
  splitting: false,
  treeshake: true,
  external: ["react", "react-dom", "next", "next/navigation"],
  // Note: tsup strips module-level "use client" directives while bundling, so
  // scripts/add-use-client.mjs re-adds it to the React entry after the build
  // (see the "build" npm script).
});
