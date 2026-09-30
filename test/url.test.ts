import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBasePath,
  buildHref,
  buildQuery,
  createRouter,
  createParser,
  defineSearchParams,
  fsBackPathSafe,
  getBreadcrumbs,
  getNearestStaticRoute,
  initializeSmartRouter,
  matchRoute,
  mergeQuery,
  normalizePath,
  omitQuery,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsDateOnly,
  parseAsEnum,
  parseAsFloat,
  parseAsInt,
  parseAsJson,
  parseAsSortOrder,
  parseAsString,
  parseQuery,
  pickQuery,
  resetSmartRouter,
  resolvePath,
  selectQuery,
  splitUrl,
  withQuery,
} from "../src/index";

beforeEach(() => {
  resetSmartRouter();
});

describe("splitUrl", () => {
  it("separates path, query and hash", () => {
    expect(splitUrl("/a/b?q=1#top")).toEqual({
      path: "/a/b",
      query: "?q=1",
      hash: "#top",
    });
    expect(splitUrl("/a/b")).toEqual({ path: "/a/b", query: "", hash: "" });
    expect(splitUrl("?q=1")).toEqual({ path: "", query: "?q=1", hash: "" });
    expect(splitUrl("#top")).toEqual({ path: "", query: "", hash: "#top" });
  });

  it("keeps a hash that contains a question mark out of the query", () => {
    expect(splitUrl("/a#b?c")).toEqual({ path: "/a", query: "", hash: "#b?c" });
  });
});

describe("query helpers", () => {
  it("merges, with undefined deleting a key", () => {
    expect(withQuery("/w/42?tab=a&sort=x", { sort: "y", page: undefined })).toBe(
      "/w/42?sort=y&tab=a"
    );
    expect(withQuery("/w/42?tab=a", { tab: undefined })).toBe("/w/42");
  });

  it("sorts keys so equal state produces equal hrefs", () => {
    expect(withQuery("/w", { b: 1, a: 2 })).toBe(withQuery("/w", { a: 2, b: 1 }));
  });

  it("supports repeated and comma array formats", () => {
    expect(buildQuery({ t: ["a", "b"] })).toBe("?t=a&t=b");
    expect(buildQuery({ t: ["a", "b"] }, { arrayFormat: "comma" })).toBe("?t=a%2Cb");
    expect(buildQuery({ t: [] })).toBe("");
  });

  it("preserves the hash", () => {
    expect(withQuery("/a?x=1#top", { y: 2 })).toBe("/a?x=1&y=2#top");
  });

  it("picks, omits, merges and selects", () => {
    const url = "/a?locale=fr&utm_source=x&page=3";
    expect(pickQuery(url, ["locale"])).toBe("/a?locale=fr");
    expect(omitQuery(url, [/^utm_/])).toBe("/a?locale=fr&page=3");
    expect(mergeQuery("/a?x=1", "/b?x=2&y=3")).toBe("/a?x=2&y=3");
    expect(selectQuery(url, ["locale", /^utm_/])).toEqual({
      locale: "fr",
      utm_source: "x",
    });
  });

  it("parses repeated keys into arrays", () => {
    expect(parseQuery("/a?t=1&t=2&u=3")).toEqual({ t: ["1", "2"], u: "3" });
  });
});

describe("normalizePath / basePath", () => {
  it("strips query, hash and trailing slash", () => {
    expect(normalizePath("/a/b/?q=1#top")).toBe("/a/b");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("//a//b//")).toBe("/a/b");
  });

  it("strips a configured basePath and locale", () => {
    expect(normalizePath("/app/w/42", { basePath: "/app" })).toBe("/w/42");
    expect(normalizePath("/app", { basePath: "/app" })).toBe("/");
    expect(normalizePath("/fr/w", { locales: ["en", "fr"] })).toBe("/w");
  });

  it("does not strip a basePath that is only a prefix of a segment", () => {
    expect(normalizePath("/application/w", { basePath: "/app" })).toBe(
      "/application/w"
    );
  });

  it("re-applies a basePath without doubling it", () => {
    expect(applyBasePath("/w/42", "/app")).toBe("/app/w/42");
    expect(applyBasePath("/app/w/42", "/app")).toBe("/app/w/42");
    expect(applyBasePath("/", "/app")).toBe("/app");
  });

  it("FEAT-07: matching and fsBack work under a basePath", () => {
    initializeSmartRouter({
      routes: ["/", "/w", "/w/[id]"],
      basePath: "/app",
      force: true,
    });

    expect(matchRoute("/app/w/42")?.route).toBe("/w/[id]");
    expect(fsBackPathSafe("/app/w/42")).toBe("/app/w");
  });
});

describe("parsers", () => {
  it("parses primitives and falls back on junk", () => {
    expect(parseAsInt.parse("42")).toBe(42);
    expect(parseAsInt.parse("abc")).toBeNull();
    expect(parseAsFloat.parse("1.5")).toBe(1.5);
    expect(parseAsString.parse("x")).toBe("x");
  });

  it('gets "false" right, unlike Boolean()', () => {
    expect(parseAsBoolean.parse("false")).toBe(false);
    expect(parseAsBoolean.parse("0")).toBe(false);
    expect(parseAsBoolean.parse("true")).toBe(true);
    expect(parseAsBoolean.parse("")).toBe(true);
    expect(parseAsBoolean.parse("maybe")).toBeNull();
  });

  it("constrains enums", () => {
    const parser = parseAsEnum(["a", "b"]);
    expect(parser.parse("a")).toBe("a");
    expect(parser.parse("z")).toBeNull();
  });

  it("round-trips arrays", () => {
    const parser = parseAsArrayOf(parseAsInt);
    expect(parser.parse("1,2,3")).toEqual([1, 2, 3]);
    expect(parser.serialize([1, 2])).toBe("1,2");
    expect(parser.parse("")).toEqual([]);
    expect(parser.eq([1, 2], [1, 2])).toBe(true);
  });

  it("round-trips dates and sort orders", () => {
    const date = parseAsDateOnly.parse("2026-08-09");
    expect(date && parseAsDateOnly.serialize(date)).toBe("2026-08-09");
    expect(parseAsDateOnly.parse("nonsense")).toBeNull();

    expect(parseAsSortOrder.parse("createdAt:desc")).toEqual({
      field: "createdAt",
      dir: "desc",
    });
    expect(parseAsSortOrder.parse("createdAt:sideways")).toBeNull();
  });

  it("round-trips JSON through base64url", () => {
    const parser = parseAsJson<{ a: number[] }>();
    const encoded = parser.serialize({ a: [1, 2] });
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(parser.parse(encoded)).toEqual({ a: [1, 2] });
    expect(parser.parse("!!!not-base64!!!")).toBeNull();
  });

  it("never throws out of a custom parser", () => {
    const parser = createParser<number>({
      parse: () => {
        throw new Error("boom");
      },
      serialize: String,
    });
    expect(parser.parse("x")).toBeNull();
  });

  it("carries defaults and options through the modifier chain", () => {
    const parser = parseAsInt
      .default(1)
      .clearOnDefault()
      .withOptions({ shallow: true, history: "push" });

    expect(parser.defaultValue).toBe(1);
    expect(parser.options).toMatchObject({
      clearOnDefault: true,
      shallow: true,
      history: "push",
    });
  });
});

describe("defineSearchParams", () => {
  const search = defineSearchParams({
    tab: parseAsEnum(["overview", "members"]).default("overview"),
    page: parseAsInt.default(1).clearOnDefault(),
    q: parseAsString.default(""),
  });

  it("parses a Next searchParams object", () => {
    expect(search.parse({ tab: "members", page: "3" })).toEqual({
      tab: "members",
      page: 3,
      q: "",
    });
  });

  it("parses URLSearchParams and raw strings identically", () => {
    const expected = { tab: "members", page: 3, q: "" };
    expect(search.parse(new URLSearchParams("tab=members&page=3"))).toEqual(expected);
    expect(search.parse("?tab=members&page=3")).toEqual(expected);
  });

  it("falls back to defaults on junk instead of throwing", () => {
    expect(search.parse({ tab: "nope", page: "abc" })).toEqual({
      tab: "overview",
      page: 1,
      q: "",
    });
  });

  it("serializes, honouring clearOnDefault", () => {
    expect(search.serialize({ tab: "members", page: 1 })).toBe("?tab=members");
    expect(search.serialize({ tab: "members", page: 3 })).toBe("?page=3&tab=members");
    expect(search.href("/w/42", { tab: "members" })).toBe("/w/42?tab=members");
  });
});

describe("review regressions", () => {
  it("a hash-only target keeps the current query, as a browser does", () => {
    expect(resolvePath("/a/b?q=1", "#top")).toBe("/a/b?q=1#top");
    // A query-only target still replaces the query.
    expect(resolvePath("/a/b?q=1", "?x=2")).toBe("/a/b?x=2");
  });

  it("defineSearchParams().href merges onto an existing query and keeps the hash", () => {
    const search = defineSearchParams({ page: parseAsInt.default(1) });

    expect(search.href("/w?x=1", { page: 2 })).toBe("/w?page=2&x=1");
    expect(search.href("/w#top", { page: 2 })).toBe("/w?page=2#top");
  });

  it("defineSearchParams().href survives being destructured", () => {
    const { href } = defineSearchParams({ page: parseAsInt.default(1) });
    expect(href("/w", { page: 3 })).toBe("/w?page=3");
  });
});

describe("locales, basePath and trailingSlash on output", () => {
  const ROUTES = ["/", "/w", "/w/[id]", "/w/[id]/members"];
  const I18N = { locales: ["en", "fr"] } as const;

  it("fsBackPathSafe and getNearestStaticRoute keep the locale", () => {
    initializeSmartRouter({ routes: ROUTES, ...I18N, force: true });

    expect(fsBackPathSafe("/fr/w/42/members")).toBe("/fr/w/42");
    expect(fsBackPathSafe("/fr/w")).toBe("/fr");
    expect(getNearestStaticRoute("/fr/w/42")).toBe("/fr/w");
    // No locale in, none out.
    expect(fsBackPathSafe("/w/42/members")).toBe("/w/42");
  });

  it("puts the locale inside basePath, and applies trailingSlash", () => {
    initializeSmartRouter({
      routes: ROUTES,
      ...I18N,
      basePath: "/app",
      trailingSlash: true,
      force: true,
    });

    expect(fsBackPathSafe("/app/fr/w/42/members")).toBe("/app/fr/w/42/");
    expect(getNearestStaticRoute("/app/fr/w/42")).toBe("/app/fr/w/");
  });

  it("breadcrumb hrefs keep the locale and stay Next-relative", () => {
    initializeSmartRouter({ routes: ROUTES, ...I18N, basePath: "/app", force: true });

    const crumbs = getBreadcrumbs("/app/fr/w/42", {
      includeRoot: true,
      labels: { "/w/42": "Acme" }, // keyed by the bare href, as before
    });

    // No basePath: these are rendered with <Link>, which adds it.
    expect(crumbs.map((c) => c.href)).toEqual(["/fr", "/fr/w", "/fr/w/42"]);
    expect(crumbs[2].label).toBe("Acme");
  });

  it("createRouter agrees with the global functions", () => {
    const router = createRouter(ROUTES, { ...I18N, basePath: "/app" });

    expect(router.fsBack("/app/fr/w/42/members")).toBe("/app/fr/w/42");
    expect(router.nearestStatic("/app/fr/w/42")).toBe("/app/fr/w");
    expect(router.breadcrumbs("/app/fr/w/42").map((c) => c.href)).toEqual([
      "/fr/w",
      "/fr/w/42",
    ]);
  });

  it("prefixes basePath even when a route starts with the same text", () => {
    initializeSmartRouter({ routes: ["/docs/[slug]"], basePath: "/docs", force: true });
    expect(buildHref("/docs/[slug]", { slug: "intro" })).toBe("/docs/docs/intro");

    const router = createRouter(["/docs/[slug]"], { basePath: "/docs" });
    expect(router.build("/docs/[slug]", { slug: "intro" })).toBe("/docs/docs/intro");
  });

  it("applyBasePath itself stays idempotent, as documented", () => {
    expect(applyBasePath("/app/w", "/app")).toBe("/app/w");
  });
});
