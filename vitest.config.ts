import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Hook and component tests opt into a DOM per-file with:
    //   // @vitest-environment happy-dom
    environmentMatchGlobs: [["test/react/**", "happy-dom"]],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts", "src/cli/bin.ts"],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});
