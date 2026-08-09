import { defineSearchParams, parseAsEnum, parseAsInt } from "next-smart-router";

// One definition, imported by the server page and the client controls.
// Next.js forbids arbitrary named exports from page.tsx, which is the other
// reason this lives in its own module.
export const workspaceSearch = defineSearchParams({
  view: parseAsEnum(["grid", "list"]).default("grid"),
  page: parseAsInt.default(1).clearOnDefault(),
});
