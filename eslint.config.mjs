import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "examples/**/.next/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        window: "readonly",
        document: "readonly",
        crypto: "readonly",
        atob: "readonly",
        btoa: "readonly",
        escape: "readonly",
        unescape: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        URLSearchParams: "readonly",
        IntersectionObserver: "readonly",
        Element: "readonly",
        Storage: "readonly",
        MouseEvent: "readonly",
        Event: "readonly",
        BeforeUnloadEvent: "readonly",
        HTMLAnchorElement: "readonly",
        Buffer: "readonly",
        NodeJS: "readonly",
        __NSR_VERSION__: "readonly",
      },
    },
    rules: {
      // The public API deliberately uses `any` in a few generic escape
      // hatches (coercers, parser maps); they are documented at each site.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["test/**", "scripts/**", "*.config.ts", "*.config.mjs"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
