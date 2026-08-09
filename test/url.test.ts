import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBasePath,
  buildQuery,
  createParser,
  defineSearchParams,
  fsBackPathSafe,
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
