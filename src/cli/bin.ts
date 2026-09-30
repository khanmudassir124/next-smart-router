#!/usr/bin/env node
import path from "node:path";

import { checkExitCode, diagnose } from "./diagnose";
import { generateRoutes } from "./generate-routes";
import { watchRoutes } from "./watch";

interface ParsedArgs {
  appDir?: string;
  out?: string;
  pageExtensions?: string[];
  ignore?: string[];
  watch?: boolean;
  check?: boolean;
  noTypes?: boolean;
  noMeta?: boolean;
  silent?: boolean;
  help?: boolean;
  version?: boolean;
  /** Non-flag tokens, in order. The first is the command. */
  positional: string[];
  /** Flags this parser does not know. A typo must not silently no-op. */
  unknown: string[];
}

/**
 * Which flags each command accepts.
 *
 * `parse()` is global across commands, so without this a typo like `--app-dr`
 * falls through to the default app dir and reports success having read the
 * wrong tree. Global-only flags are always allowed.
 */
const GLOBAL_FLAGS = ["-h", "--help", "-v", "--version"];

const COMMAND_FLAGS: Record<string, string[]> = {
  generate: [
    "--app-dir",
    "-o",
    "--out",
    "--page-extensions",
    "--ignore",
    "-w",
    "--watch",
    "--check",
    "--no-types",
    "--no-meta",
    "--silent",
  ],
};

function parse(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { positional: [], unknown: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith("-")) {
      args.positional.push(arg);
      continue;
    }

    const [flag, inline] =
      arg.startsWith("--") && arg.includes("=")
        ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
        : [arg, undefined];

    // Consuming the value here is what keeps it out of `positional`.
    const next = () => inline ?? argv[++i];

    switch (flag) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-v":
      case "--version":
        args.version = true;
        break;
      case "--app-dir":
        args.appDir = next();
        break;
      case "-o":
      case "--out":
        args.out = next();
        break;
      case "--page-extensions":
        args.pageExtensions = (next() ?? "").split(",").filter(Boolean);
        break;
      case "--ignore":
        args.ignore = (next() ?? "").split(",").filter(Boolean);
        break;
      case "-w":
      case "--watch":
        args.watch = true;
        break;
      case "--check":
        args.check = true;
        break;
      case "--no-types":
        args.noTypes = true;
        break;
      case "--no-meta":
        args.noMeta = true;
        break;
      case "--silent":
        args.silent = true;
        break;
      default:
        args.unknown.push(flag);
        break;
    }
  }

  return args;
}

const HELP = `next-smart-router — generate a route manifest from a Next.js app directory

Usage:
  next-smart-router generate [options]

Options:
  --app-dir <path>          Path to the Next.js "app" directory (default: ./app)
  --out, -o <path>          Output file. ".json" emits JSON, otherwise a TS module
                            exporting "ROUTES" (default: ./route-manifest.ts)
  --page-extensions <list>  Comma-separated, mirrors next.config pageExtensions
                            (default: tsx,ts,jsx,js,mdx,md)
  --ignore <list>           Comma-separated directory names to skip
  --watch, -w               Regenerate on change (debounced, writes only on diff)
  --check                   Exit non-zero if the manifest is stale or conflicted.
                            Also reports unreachable routes and whether Next
                            itself would reject the route set, as warnings
                            that do NOT affect the exit code.
  --no-types                Skip the "Route" union type
  --no-meta                 Skip collecting route.meta.json sidecars
  --silent                  Suppress output
  -h, --help                Show this help
  -v, --version             Show the version

Examples:
  next-smart-router generate
  next-smart-router generate --app-dir src/app --out src/route-manifest.ts
  next-smart-router generate --watch
  next-smart-router generate --check          # in CI
  next-smart-router generate -o routes.json
`;

export function main(argv: string[] = process.argv.slice(2)): void {
  // Flags may come before the command (`--help`, `-v`), so parse the whole
  // list and take the first token that wasn't a flag or a flag's value.
  const args = parse(argv);
  const command = args.positional[0];

  if (args.version) {
    process.stdout.write(`${__NSR_VERSION__}\n`);
    return;
  }

  if (args.help || !command || command === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (command !== "generate") {
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    process.exit(1);
  }

  // A flag this command does not accept is an error, not a silent no-op. The
  // old parser ignored anything it did not recognise, so `--app-dr` read the
  // default app directory and reported success having done the wrong thing.
  const allowed = new Set([...GLOBAL_FLAGS, ...(COMMAND_FLAGS[command] ?? [])]);
  const rejected = args.unknown.filter((flag) => !allowed.has(flag));
  if (rejected.length) {
    process.stderr.write(
      `Unknown ${rejected.length === 1 ? "option" : "options"} for "${command}": ` +
        `${rejected.join(", ")}\n\n${HELP}`
    );
    process.exit(1);
  }

  const options = {
    appDir: args.appDir ? path.resolve(args.appDir) : undefined,
    out: args.out ? path.resolve(args.out) : undefined,
    pageExtensions: args.pageExtensions,
    ignore: args.ignore,
    emitTypes: !args.noTypes,
    emitMeta: !args.noMeta,
    log: !args.silent,
  };

  try {
    if (args.watch) {
      const stop = watchRoutes(options);
      process.on("SIGINT", () => {
        stop();
        process.exit(0);
      });
      return;
    }

    const result = generateRoutes(options);

    if (args.check) {
      if (result.changed) {
        process.stderr.write(
          `✗ next-smart-router: ${path.relative(process.cwd(), result.out)} was out of date and has been rewritten.\n` +
            `  Commit the regenerated manifest.\n`
        );
      }

      // Unreachable routes and a Next rejection are REPORTED but do not change
      // the exit code. Neither has been validated against apps that rewrite, so
      // failing a build on them would be a promise this cannot keep yet.
      if (!args.silent) {
        for (const line of diagnose(result.routes).lines) {
          process.stderr.write(`${line}\n`);
        }
      }

      const code = checkExitCode(result);
      if (code !== 0) process.exit(code);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

// This module is only ever the executable, so it always runs.
//
// It previously guarded on `process.argv[1]` matching /bin\.js$/ "so the module
// stays importable in tests". That silently broke the real CLI: npm's bin entry
// on Linux and macOS is a symlink named `next-smart-router`, so argv[1] never
// matched and `generate` exited 0 having done nothing. (Windows was fine — its
// shim is a .cmd that invokes `node …\bin.js`.) Test the built binary by
// spawning it, not by importing this file.
main();
