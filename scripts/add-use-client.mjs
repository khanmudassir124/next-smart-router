// Re-add the "use client" directive to the built React entry.
//
// tsup/esbuild strip module-level directives while bundling, so we prepend it
// after the build completes. Runs as part of the "build" npm script.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const directive = '"use client";\n';
const targets = ["react.js", "react.cjs"];

for (const file of targets) {
  const path = resolve(dist, file);
  if (!existsSync(path)) continue;

  const code = readFileSync(path, "utf8");
  if (code.startsWith(directive)) continue;

  writeFileSync(path, directive + code);
  console.log(`✅ added "use client" to dist/${file}`);
}
