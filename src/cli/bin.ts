#!/usr/bin/env node
import path from "node:path";
import { generateRoutes } from "./generate-routes";

interface ParsedArgs {
  appDir?: string;
  out?: string;
  help?: boolean;
}

function parse(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg === "--app-dir") args.appDir = argv[++i];
    else if (arg === "--out" || arg === "-o") args.out = argv[++i];
    else if (arg.startsWith("--app-dir=")) args.appDir = arg.split("=")[1];
    else if (arg.startsWith("--out=")) args.out = arg.split("=")[1];
  }
  return args;
}

const HELP = `next-smart-router — generate a route manifest from a Next.js app directory

Usage:
  next-smart-router generate [options]

Options:
  --app-dir <path>   Path to the Next.js "app" directory (default: ./app)
  --out, -o <path>   Output file. ".json" emits JSON, otherwise a TS module
                     exporting "ROUTES" (default: ./route-manifest.ts)
  -h, --help         Show this help

Examples:
  next-smart-router generate
  next-smart-router generate --app-dir src/app --out src/route-manifest.ts
  next-smart-router generate -o routes.json
`;

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parse(rest);

  if (args.help || !command || command === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (command === "generate") {
    generateRoutes({
      appDir: args.appDir ? path.resolve(args.appDir) : undefined,
      out: args.out ? path.resolve(args.out) : undefined,
    });
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
  process.exit(1);
}

main();
