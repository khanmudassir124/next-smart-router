import { describe, expect, it } from "vitest";

import {
  checkExitCode,
  checkWithNext,
  diagnose,
  formatNextCheck,
  formatUnreachable,
} from "../src/cli/diagnose";
import type { RouteConflict } from "../src/core/create-router";

const error: RouteConflict = {
  level: "error",
  kind: "catch-all-not-last",
  message: "boom",
  routes: ["/[...a]/b"],
};

const warning: RouteConflict = {
  level: "warning",
  kind: "param-name-mismatch",
  message: "meh",
  routes: ["/w/[id]", "/w/[slug]"],
};

/**
 * The exit code is tested as a pure function on purpose.
 *
 * `test/cli.test.ts` skips every binary-spawning case when `dist/` is absent,
 * and the CI verify job (node 18/20/22 x next 13.5/14/15) runs `npm test`
 * without building — so those cases execute in exactly one of ten jobs. Exit
 * codes are the whole contract of `--check`; they need to run everywhere.
 */
describe("checkExitCode", () => {
  it("C-01: exits 0 when the manifest is current and conflict-free", () => {
    expect(checkExitCode({ conflicts: [], changed: false })).toBe(0);
  });

  it("C-02: exits 1 when the manifest was stale", () => {
    expect(checkExitCode({ conflicts: [], changed: true })).toBe(1);
  });

  it("C-03: exits 1 on an error-level conflict", () => {
    expect(checkExitCode({ conflicts: [error], changed: false })).toBe(1);
  });

  it("C-04: a warning-level conflict alone does NOT fail the build", () => {
    // Unchanged from before this feature existed. Warnings never gated --check.
    expect(checkExitCode({ conflicts: [warning], changed: false })).toBe(0);
  });
});

describe("checkWithNext", () => {
  it("C-05: reports ok when the sorter accepts the set", () => {
    expect(checkWithNext(["/", "/w/[id]"], () => (routes) => routes)).toEqual({
      status: "ok",
    });
  });

  it("C-06: reports a rejection with Next's own message", () => {
    const check = checkWithNext(["/w/[id]", "/w/[slug]"], () => () => {
      throw new Error("You cannot use different slug names for the same dynamic path");
    });

    expect(check.status).toBe("rejected");
    if (check.status === "rejected") expect(check.message).toContain("slug names");
  });

  it("C-07: degrades to unavailable when the deep import cannot be loaded", () => {
    const check = checkWithNext(["/"], () => {
      throw new Error("Cannot find module 'next/dist/...'");
    });

    expect(check.status).toBe("unavailable");
  });

  it("C-08: never throws, whatever the probe does", () => {
    expect(() =>
      checkWithNext(["/"], () => {
        throw "a string, not an Error";
      })
    ).not.toThrow();
  });
});

describe("output", () => {
  it("C-09: says nothing when every route is reachable", () => {
    expect(formatUnreachable([])).toEqual([]);
  });

  it("C-10: scopes the claim to what the manifest models", () => {
    const lines = formatUnreachable([
      { route: "/w/[other]", witnesses: [{ url: "/w/__nsr0", wonBy: "/w/[id]" }] },
    ]);
    const text = lines.join("\n");

    // The honesty requirement: this cannot see rewrites, and must say so
    // before anyone deletes a page on its say-so.
    expect(text).toContain("that this manifest models");
    expect(text).toContain("next.config and middleware are NOT modeled");
    // And it must show the proof, not just the accusation.
    expect(text).toContain("/w/__nsr0");
    expect(text).toContain("/w/[id]");
  });

  it("C-11: an unavailable probe reads as skipped, not as a failure", () => {
    const lines = formatNextCheck({ status: "unavailable", reason: "nope" });

    expect(lines.join("\n")).toContain("skipped");
    expect(lines.join("\n")).not.toContain("✗");
  });

  it("C-12: a Next rejection names the consequence", () => {
    const lines = formatNextCheck({ status: "rejected", message: "bad set" });

    expect(lines.join("\n")).toContain("next build");
  });
});

describe("diagnose", () => {
  it("C-13: is silent on a healthy route set", () => {
    const result = diagnose(["/", "/w/[id]", "/w/[id]/settings"], () => (r) => r);

    expect(result.unreachable).toEqual([]);
    expect(result.lines).toEqual([]);
  });

  it("C-14: reports a genuinely unreachable route", () => {
    const result = diagnose(["/w/[id]", "/w/[other]"], () => (r) => r);

    expect(result.unreachable.map((u) => u.route)).toEqual(["/w/[other]"]);
    expect(result.lines.join("\n")).toContain("/w/[other]");
  });
});
